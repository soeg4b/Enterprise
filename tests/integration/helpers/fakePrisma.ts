// Minimal in-memory Prisma fake covering the operations exercised by integration tests.
// Reset() clears all stores between tests.
//
// NOT a full Prisma re-implementation. We model only the patterns used by:
//   - auth/auth.routes.ts        (User, RefreshToken, AuditLog)
//   - orders/orders.routes.ts    (Order, Customer)
//   - milestones/milestones.routes.ts (Milestone, MilestoneEvent, Site)
//   - sync/sync.routes.ts        (Site, Milestone, MilestoneEvent, FieldUpdate, SyncOutbox, SyncCursor)
//   - reports/reports.routes.ts  (Order, SOW, Department)

import { randomUUID } from 'node:crypto';

type Row = Record<string, unknown>;
const stores: Record<string, Map<string, Row>> = {};

function s(name: string): Map<string, Row> {
  if (!stores[name]) stores[name] = new Map();
  return stores[name]!;
}

export function resetFakePrisma(): void {
  for (const k of Object.keys(stores)) stores[k]!.clear();
}

export function seed(name: string, rows: Row[]): Row[] {
  const out: Row[] = [];
  for (const r of rows) {
    const id = (r.id as string | undefined) ?? randomUUID();
    const row: Row = {
      id,
      createdAt: r.createdAt ?? new Date(),
      updatedAt: r.updatedAt ?? new Date(),
      deletedAt: r.deletedAt ?? null,
      ...r,
    };
    s(name).set(id, row);
    out.push(row);
  }
  return out;
}

export function dump(name: string): Row[] {
  return Array.from(s(name).values());
}

// ---- where matcher ----------------------------------------------------------

function matchValue(actual: unknown, predicate: unknown): boolean {
  if (predicate && typeof predicate === 'object' && !(predicate instanceof Date) && !Array.isArray(predicate)) {
    const p = predicate as Record<string, unknown>;
    if ('equals' in p) return actual === p.equals;
    if ('not' in p) return actual !== p.not;
    if ('gt' in p) return actual instanceof Date && p.gt instanceof Date ? actual > p.gt : (actual as number) > (p.gt as number);
    if ('gte' in p) return (actual as number) >= (p.gte as number);
    if ('lt' in p) return (actual as number) < (p.lt as number);
    if ('lte' in p) return (actual as number) <= (p.lte as number);
    if ('contains' in p) return String(actual ?? '').toLowerCase().includes(String(p.contains).toLowerCase());
    if ('in' in p) return Array.isArray(p.in) && (p.in as unknown[]).includes(actual);
    // nested object treated as relational filter — skip strict check (return true to be permissive)
    return true;
  }
  return actual === predicate;
}

function matchesWhere(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND' && Array.isArray(v)) {
      if (!(v as Record<string, unknown>[]).every((sub) => matchesWhere(row, sub))) return false;
      continue;
    }
    if (k === 'OR' && Array.isArray(v)) {
      if (!(v as Record<string, unknown>[]).some((sub) => matchesWhere(row, sub))) return false;
      continue;
    }
    if (!matchValue(row[k], v)) return false;
  }
  return true;
}

// ---- model factory ---------------------------------------------------------

function model(name: string) {
  const store = s(name);
  return {
    async findFirst({ where }: { where?: Record<string, unknown> } = {}) {
      for (const r of store.values()) if (matchesWhere(r, where)) return { ...r };
      return null;
    },
    async findUnique({ where }: { where: Record<string, unknown> }) {
      for (const r of store.values()) if (matchesWhere(r, where)) return { ...r };
      return null;
    },
    async findMany({ where, take, skip, orderBy }: {
      where?: Record<string, unknown>;
      take?: number;
      skip?: number;
      orderBy?: Record<string, 'asc' | 'desc'>;
    } = {}) {
      let rows = Array.from(store.values()).filter((r) => matchesWhere(r, where));
      if (orderBy) {
        const [k, dir] = Object.entries(orderBy)[0]!;
        rows = rows.sort((a, b) => {
          const av = a[k] as number | string | Date;
          const bv = b[k] as number | string | Date;
          if (av === bv) return 0;
          return ((av as number) > (bv as number) ? 1 : -1) * (dir === 'desc' ? -1 : 1);
        });
      }
      if (skip) rows = rows.slice(skip);
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => ({ ...r }));
    },
    async count({ where }: { where?: Record<string, unknown> } = {}) {
      return Array.from(store.values()).filter((r) => matchesWhere(r, where)).length;
    },
    async create({ data }: { data: Row }) {
      const id = (data.id as string | undefined) ?? randomUUID();
      const row: Row = {
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...data,
      };
      store.set(id, row);
      return { ...row };
    },
    async update({ where, data }: { where: Record<string, unknown>; data: Row }) {
      let row: Row | undefined;
      for (const r of store.values()) if (matchesWhere(r, where)) { row = r; break; }
      if (!row) throw new Error(`${name}.update: record not found`);
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    async updateMany({ where, data }: { where?: Record<string, unknown>; data: Row }) {
      const rows = Array.from(store.values()).filter((r) => matchesWhere(r, where));
      for (const r of rows) Object.assign(r, data);
      return { count: rows.length };
    },
    async delete({ where }: { where: Record<string, unknown> }) {
      for (const [id, r] of store.entries()) if (matchesWhere(r, where)) { store.delete(id); return { ...r }; }
      throw new Error(`${name}.delete: record not found`);
    },
    async upsert({ where, create, update }: {
      where: Record<string, unknown>;
      create: Row;
      update: Row;
    }) {
      for (const r of store.values()) {
        if (matchesWhere(r, where)) { Object.assign(r, update, { updatedAt: new Date() }); return { ...r }; }
      }
      const id = (create.id as string | undefined) ?? randomUUID();
      const row: Row = { id, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...create };
      store.set(id, row);
      return { ...row };
    },
  };
}

// ---- exposed prisma surface -------------------------------------------------

export const fakePrisma = {
  user: model('user'),
  refreshToken: model('refreshToken'),
  order: model('order'),
  customer: model('customer'),
  department: model('department'),
  site: model('site'),
  milestone: model('milestone'),
  milestoneEvent: model('milestoneEvent'),
  fieldUpdate: model('fieldUpdate'),
  syncOutbox: model('syncOutbox'),
  syncCursor: model('syncCursor'),
  sOW: model('sOW'),
  auditLog: model('auditLog'),
  importJob: model('importJob'),
  async $queryRaw() { return [{ '?column?': 1 }]; },
  async $transaction(arg: unknown) {
    if (Array.isArray(arg)) return Promise.all(arg);
    if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(fakePrisma);
    return undefined;
  },
  $use() { /* no-op (ignore middleware in tests) */ },
  $on() { /* no-op */ },
  $disconnect: async () => {},
};
