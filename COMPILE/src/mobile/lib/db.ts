// expo-sqlite outbox + sync_cursor for offline-first field updates.
// Simplified MVP: small synchronous-style API on top of expo-sqlite v13.

import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export async function initDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = SQLite.openDatabase('deliveriq.db');
  await execAsync(db, [
    `CREATE TABLE IF NOT EXISTS outbox (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       client_id TEXT NOT NULL UNIQUE,
       entity TEXT NOT NULL,
       op TEXT NOT NULL,
       payload TEXT NOT NULL,
       created_at TEXT NOT NULL,
       sent_at TEXT,
       result TEXT
     );`,
    `CREATE TABLE IF NOT EXISTS sync_cursor (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       cursor TEXT
     );`,
    `CREATE TABLE IF NOT EXISTS cached_site (
       id TEXT PRIMARY KEY,
       payload TEXT NOT NULL
     );`,
  ]);
  _db = db;
  return db;
}

function execAsync(db: SQLite.SQLiteDatabase, sqls: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx) => sqls.forEach((s) => tx.executeSql(s)),
      (e) => reject(e),
      () => resolve(),
    );
  });
}

export function db(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('DB not initialised; call initDb() first');
  return _db;
}

export interface OutboxItem { id: number; clientId: string; entity: string; op: string; payload: unknown; createdAt: string; sentAt: string | null; }

export async function queueOutbox(entity: string, op: string, payload: unknown): Promise<string> {
  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const created = new Date().toISOString();
  await new Promise<void>((res, rej) => {
    db().transaction((tx) => {
      tx.executeSql(
        `INSERT INTO outbox (client_id, entity, op, payload, created_at) VALUES (?, ?, ?, ?, ?)`,
        [clientId, entity, op, JSON.stringify(payload), created],
        () => res(),
        (_t, err) => { rej(err); return false; },
      );
    });
  });
  return clientId;
}

export async function pendingOutbox(): Promise<OutboxItem[]> {
  return new Promise((res, rej) => {
    db().readTransaction((tx) => {
      tx.executeSql(
        `SELECT id, client_id, entity, op, payload, created_at, sent_at FROM outbox WHERE sent_at IS NULL ORDER BY id ASC`,
        [],
        (_t, r) => {
          const rows: OutboxItem[] = [];
          for (let i = 0; i < r.rows.length; i++) {
            const row = r.rows.item(i);
            rows.push({
              id: row.id, clientId: row.client_id, entity: row.entity, op: row.op,
              payload: JSON.parse(row.payload), createdAt: row.created_at, sentAt: row.sent_at,
            });
          }
          res(rows);
        },
        (_t, err) => { rej(err); return false; },
      );
    });
  });
}

export async function markSent(clientId: string, result: unknown): Promise<void> {
  const sent = new Date().toISOString();
  await new Promise<void>((res, rej) => {
    db().transaction((tx) => {
      tx.executeSql(
        `UPDATE outbox SET sent_at = ?, result = ? WHERE client_id = ?`,
        [sent, JSON.stringify(result), clientId],
        () => res(),
        (_t, err) => { rej(err); return false; },
      );
    });
  });
}

export async function getCursor(): Promise<string | null> {
  return new Promise((res, rej) => {
    db().readTransaction((tx) => {
      tx.executeSql(`SELECT cursor FROM sync_cursor WHERE id = 1`, [], (_t, r) => {
        res(r.rows.length ? r.rows.item(0).cursor : null);
      }, (_t, err) => { rej(err); return false; });
    });
  });
}

export async function setCursor(cursor: string): Promise<void> {
  await new Promise<void>((res, rej) => {
    db().transaction((tx) => {
      tx.executeSql(
        `INSERT INTO sync_cursor (id, cursor) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET cursor = excluded.cursor`,
        [cursor], () => res(), (_t, err) => { rej(err); return false; },
      );
    });
  });
}
