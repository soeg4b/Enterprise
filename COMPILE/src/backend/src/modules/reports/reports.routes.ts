// Reports module — BOD aggregate + dept funnel, Redis-cached.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import dayjs from 'dayjs';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../auth/auth.js';
import { cache } from '../../services/cache.js';
import { Errors } from '../../lib/errors.js';
import type {
  BodReportDto,
  DepartmentReportDto,
  ExecutiveSummaryDto,
  PartnerDeliveryReportDto,
  PartnerDeliveryRowDto,
  ProductCategory,
} from 'deliveriq-shared';

const KEY_BOD = cache.key('default', 'reports', 'bod');
const TTL_BOD = 60;
const KEY_EXEC = cache.key('default', 'reports', 'executive');
const KEY_PARTNER = cache.key('default', 'reports', 'partner-delivery');
const TTL_REPORT = 60;

const ExecutiveDetailQuery = z.object({
  dimension: z.enum(['province', 'productCategory']),
  value: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// Indonesian city → province map (covers seed cities; defaults to "Lainnya").
const CITY_TO_PROVINCE: Record<string, string> = {
  'jakarta': 'DKI Jakarta',
  'tanjung priok': 'DKI Jakarta',
  'bandung': 'Jawa Barat',
  'bekasi': 'Jawa Barat',
  'bogor': 'Jawa Barat',
  'depok': 'Jawa Barat',
  'surabaya': 'Jawa Timur',
  'malang': 'Jawa Timur',
  'tanjung perak': 'Jawa Timur',
  'yogyakarta': 'DI Yogyakarta',
  'semarang': 'Jawa Tengah',
  'denpasar': 'Bali',
  'palembang': 'Sumatra Selatan',
  'medan': 'Sumatra Utara',
  'belawan': 'Sumatra Utara',
  'balikpapan': 'Kalimantan Timur',
  'samarinda': 'Kalimantan Timur',
  'banjarmasin': 'Kalimantan Selatan',
  'manado': 'Sulawesi Utara',
  'makassar': 'Sulawesi Selatan',
  'banten': 'Banten',
  'serang': 'Banten',
  'tangerang': 'Banten',
};

function provinceFromCity(city: string | null | undefined): string {
  if (!city) return 'Tidak Diketahui';
  return CITY_TO_PROVINCE[city.trim().toLowerCase()] ?? 'Lainnya';
}

function aggregateWarningLevel(levels: Array<'ON_TRACK' | 'AT_RISK' | 'DELAY'>): 'ON_TRACK' | 'AT_RISK' | 'DELAY' | 'UNKNOWN' {
  if (levels.length === 0) return 'UNKNOWN';
  if (levels.some((l) => l === 'DELAY')) return 'DELAY';
  if (levels.some((l) => l === 'AT_RISK')) return 'AT_RISK';
  return 'ON_TRACK';
}

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/reports/bod',
    { preHandler: [requireAuth] },
    async () => {
      const { value, cacheStatus } = await cache.getOrBuild<BodReportDto>(KEY_BOD, TTL_BOD, async () => {
        const [orders, sows, departments] = await Promise.all([
          prisma.order.findMany({ select: { contractValue: true, otcAmount: true, mrcAmount: true, capexBudget: true, departmentId: true } }),
          prisma.sOW.findMany({
            select: { id: true, soId: true, planRfsDate: true, actualRfsDate: true, warningLevel: true, so: { select: { order: { select: { departmentId: true, otcAmount: true, mrcAmount: true } } } } },
          }),
          prisma.department.findMany({ select: { id: true, code: true, name: true } }),
        ]);

        const totalRevenue = orders.reduce((acc, o) => acc + Number(o.contractValue ?? 0), 0);
        const totalCapex = orders.reduce((acc, o) => acc + Number(o.capexBudget ?? 0), 0);

        let onTrack = 0, atRisk = 0, delay = 0, overdueCount = 0;
        for (const s of sows) {
          if (s.warningLevel === 'ON_TRACK') onTrack++;
          else if (s.warningLevel === 'AT_RISK') atRisk++;
          else delay++;
          if (s.warningLevel === 'DELAY') overdueCount++;
        }
        const totalSow = sows.length || 1;
        const onTrackPercent = Math.round((onTrack / totalSow) * 1000) / 10;

        // Revenue at risk: sum of (otc + 12*mrc) of orders with any DELAY sow.
        const horizon = Number(process.env.MRC_HORIZON_MONTHS ?? '12');
        const orderRiskMap = new Map<string, { otc: number; mrc: number; deptId: string | null }>();
        for (const s of sows) {
          if (s.warningLevel !== 'DELAY' || s.actualRfsDate) continue;
          const order = s.so?.order;
          if (!order) continue;
          const key = `${order.departmentId ?? 'na'}`;
          const cur = orderRiskMap.get(key) ?? { otc: 0, mrc: 0, deptId: order.departmentId };
          cur.otc += Number(order.otcAmount ?? 0);
          cur.mrc += Number(order.mrcAmount ?? 0) * horizon;
          orderRiskMap.set(key, cur);
        }
        const revenueAtRisk = Array.from(orderRiskMap.values()).reduce((a, v) => a + v.otc + v.mrc, 0);

        // RFS month plan vs actual (current WIB month)
        const monthStart = dayjs().startOf('month').toDate();
        const monthEnd = dayjs().endOf('month').toDate();
        const rfsMonthPlan = sows.filter((s) => s.planRfsDate >= monthStart && s.planRfsDate <= monthEnd).length;
        const rfsMonthActual = sows.filter((s) => s.actualRfsDate && s.actualRfsDate >= monthStart && s.actualRfsDate <= monthEnd).length;

        const deptCounts = new Map<string, { onTrack: number; atRisk: number; delay: number }>();
        for (const s of sows) {
          const deptId = s.so?.order?.departmentId ?? 'na';
          const cur = deptCounts.get(deptId) ?? { onTrack: 0, atRisk: 0, delay: 0 };
          if (s.warningLevel === 'ON_TRACK') cur.onTrack++;
          else if (s.warningLevel === 'AT_RISK') cur.atRisk++;
          else cur.delay++;
          deptCounts.set(deptId, cur);
        }

        const dto: BodReportDto = {
          totalRevenue: totalRevenue.toFixed(2),
          revenueAtRisk: revenueAtRisk.toFixed(2),
          onTrackPercent,
          capexConsumedPercent: 0, // TODO: requires capex entries totals
          rfsMonthPlan,
          rfsMonthActual,
          overdueCount,
          statusDistribution: { onTrack, atRisk, delay },
          departments: departments.map((d) => {
            const c = deptCounts.get(d.id) ?? { onTrack: 0, atRisk: 0, delay: 0 };
            return { departmentId: d.id, departmentCode: d.code, departmentName: d.name, ...c };
          }),
          generatedAt: new Date().toISOString(),
          cacheStatus: 'MISS',
        };
        return dto;
      });
      return { ...value, cacheStatus };
    },
  );

  app.get(
    '/v1/reports/department/:id',
    { preHandler: [requireAuth, requireRole('AD', 'BOD', 'DH')] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const dept = await prisma.department.findFirst({ where: { id } });
      if (!dept) throw Errors.notFound('Department');

      const milestones = await prisma.milestone.findMany({
        where: { sow: { so: { order: { departmentId: id } } } },
        select: { type: true, status: true, planDate: true },
      });
      const today = new Date();
      const grouped = new Map<string, { count: number; overdue: number; totalDays: number; doneCount: number }>();
      for (const m of milestones) {
        const cur = grouped.get(m.type) ?? { count: 0, overdue: 0, totalDays: 0, doneCount: 0 };
        cur.count++;
        if (m.status !== 'DONE' && m.planDate && m.planDate < today) cur.overdue++;
        if (m.status === 'DONE' && m.planDate) {
          cur.totalDays += Math.max(0, Math.floor((today.getTime() - m.planDate.getTime()) / 86400000));
          cur.doneCount++;
        }
        grouped.set(m.type, cur);
      }
      const dto: DepartmentReportDto = {
        departmentId: dept.id,
        departmentCode: dept.code,
        departmentName: dept.name,
        funnel: Array.from(grouped.entries()).map(([stage, v]) => ({
          stage: stage as never,
          count: v.count,
          overdue: v.overdue,
          avgDaysInStage: v.doneCount ? Math.round(v.totalDays / v.doneCount) : 0,
        })),
        generatedAt: new Date().toISOString(),
      };
      return dto;
    },
  );

  // ===========================================================================
  // EXECUTIVE SUMMARY — province table, PO monitoring, implementation, capex.
  // ===========================================================================
  app.get(
    '/v1/reports/executive-summary',
    { preHandler: [requireAuth] },
    async () => {
      const { value, cacheStatus } = await cache.getOrBuild<ExecutiveSummaryDto>(
        KEY_EXEC,
        TTL_REPORT,
        async () => {
          const [orders, sows, sites, capexBudgets, capexEntries, departments, customers] =
            await Promise.all([
              prisma.order.findMany({
                select: {
                  id: true,
                  orderNumber: true,
                  productCategory: true,
                  contractValue: true,
                  capexBudget: true,
                  startDate: true,
                  signedAt: true,
                  customerId: true,
                  departmentId: true,
                },
              }),
              prisma.sOW.findMany({
                select: {
                  id: true,
                  soId: true,
                  progressPct: true,
                  actualRfsDate: true,
                  warningLevel: true,
                  so: { select: { orderId: true } },
                },
              }),
              prisma.site.findMany({ select: { city: true, province: true, sowId: true } }),
              prisma.capexBudget.findMany({
                select: { id: true, soId: true, programId: true, budget: true, fiscalYear: true },
              }),
              prisma.capexEntry.findMany({ select: { capexBudgetId: true, amount: true } }),
              prisma.department.findMany({ select: { id: true, code: true, name: true } }),
              prisma.customer.findMany({ select: { id: true, code: true, name: true } }),
            ]);

          // ---- filters meta ---------------------------------------------------
          const yearSet = new Set<number>();
          for (const o of orders) {
            const d = o.signedAt ?? o.startDate;
            if (d) yearSet.add(d.getUTCFullYear());
          }
          const productSet = new Set<ProductCategory>();
          for (const o of orders) productSet.add(o.productCategory as ProductCategory);

          // ---- province aggregation (per order) -------------------------------
          const sowToOrder = new Map<string, string>();
          for (const s of sows) sowToOrder.set(s.id, s.so?.orderId ?? '');

          const orderProvinces = new Map<string, Set<string>>();
          for (const site of sites) {
            const orderId = sowToOrder.get(site.sowId);
            if (!orderId) continue;
            const prov = (site.province?.trim() || provinceFromCity(site.city));
            const set = orderProvinces.get(orderId) ?? new Set<string>();
            set.add(prov);
            orderProvinces.set(orderId, set);
          }
          const provinceCounts = new Map<string, number>();
          for (const set of orderProvinces.values()) {
            for (const prov of set) {
              provinceCounts.set(prov, (provinceCounts.get(prov) ?? 0) + 1);
            }
          }
          const projectsByProvince = Array.from(provinceCounts.entries())
            .map(([province, totalProjects]) => ({ province, country: 'Indonesia', totalProjects }))
            .sort((a, b) => b.totalProjects - a.totalProjects);

          // ---- PO Monitoring by product category ------------------------------
          const sowsByOrder = new Map<string, typeof sows>();
          for (const s of sows) {
            const oid = s.so?.orderId;
            if (!oid) continue;
            const arr = sowsByOrder.get(oid) ?? [];
            arr.push(s);
            sowsByOrder.set(oid, arr);
          }
          const poByCat = new Map<
            ProductCategory,
            { released: number; delivered: number; poValue: number; deliveredValue: number }
          >();
          for (const o of orders) {
            const cat = o.productCategory as ProductCategory;
            const cur = poByCat.get(cat) ?? { released: 0, delivered: 0, poValue: 0, deliveredValue: 0 };
            cur.released++;
            cur.poValue += Number(o.contractValue ?? 0);
            const orderSows = sowsByOrder.get(o.id) ?? [];
            const delivered = orderSows.length > 0 && orderSows.every((s) => !!s.actualRfsDate);
            if (delivered) {
              cur.delivered++;
              cur.deliveredValue += Number(o.contractValue ?? 0);
            }
            poByCat.set(cat, cur);
          }
          const poRows = Array.from(poByCat.entries())
            .map(([productCategory, v]) => ({
              productCategory,
              totalReleased: v.released,
              totalDelivered: v.delivered,
            }))
            .sort((a, b) => a.productCategory.localeCompare(b.productCategory));
          let grandReleased = 0, grandDelivered = 0, totalPoValue = 0, totalDeliveredValue = 0;
          for (const v of poByCat.values()) {
            grandReleased += v.released;
            grandDelivered += v.delivered;
            totalPoValue += v.poValue;
            totalDeliveredValue += v.deliveredValue;
          }

          // ---- Implementation aggregation per project -------------------------
          const projectImpl: Array<{ orderId: string; pct: number }> = [];
          for (const [orderId, arr] of sowsByOrder) {
            if (arr.length === 0) continue;
            const sum = arr.reduce((a, s) => a + Number(s.progressPct ?? 0), 0);
            projectImpl.push({ orderId, pct: sum / arr.length });
          }
          let implComplete = 0, implInProgress = 0;
          const implBuckets = { lt10: 0, p10_50: 0, p50_90: 0, p100: 0 };
          for (const p of projectImpl) {
            if (p.pct >= 100) { implComplete++; implBuckets.p100++; }
            else {
              implInProgress++;
              if (p.pct < 10) implBuckets.lt10++;
              else if (p.pct < 50) implBuckets.p10_50++;
              else implBuckets.p50_90++;
            }
          }
          const overallImplPct = projectImpl.length
            ? Math.round((projectImpl.reduce((a, p) => a + p.pct, 0) / projectImpl.length) * 10) / 10
            : 0;

          // ---- CAPEX realization aggregation ---------------------------------
          const entriesByBudget = new Map<string, number>();
          for (const e of capexEntries) {
            entriesByBudget.set(
              e.capexBudgetId,
              (entriesByBudget.get(e.capexBudgetId) ?? 0) + Number(e.amount),
            );
          }
          const soToOrder = new Map<string, string>();
          for (const s of sows) {
            if (s.so?.orderId) soToOrder.set(s.soId, s.so.orderId);
          }
          const orderCapex = new Map<string, { budget: number; spent: number }>();
          for (const o of orders) {
            orderCapex.set(o.id, { budget: Number(o.capexBudget ?? 0), spent: 0 });
          }
          for (const cb of capexBudgets) {
            const orderId = cb.soId ? soToOrder.get(cb.soId) : null;
            if (!orderId) continue;
            const cur = orderCapex.get(orderId);
            if (!cur) continue;
            cur.spent += entriesByBudget.get(cb.id) ?? 0;
          }
          let overBudget = 0, underBudget = 0;
          const capexBuckets = { lt10: 0, p10_50: 0, p50_90: 0, p100: 0, gt100: 0 };
          let capexBudgetSum = 0, capexSpentSum = 0;
          for (const c of orderCapex.values()) {
            if (c.budget <= 0) continue;
            capexBudgetSum += c.budget;
            capexSpentSum += c.spent;
            const pct = (c.spent / c.budget) * 100;
            if (pct > 100) { overBudget++; capexBuckets.gt100++; }
            else {
              underBudget++;
              if (pct >= 100) capexBuckets.p100++;
              else if (pct >= 50) capexBuckets.p50_90++;
              else if (pct >= 10) capexBuckets.p10_50++;
              else capexBuckets.lt10++;
            }
          }
          const overallCapexPct = capexBudgetSum > 0
            ? Math.round((capexSpentSum / capexBudgetSum) * 1000) / 10
            : 0;

          const dto: ExecutiveSummaryDto = {
            filters: {
              years: Array.from(yearSet).sort((a, b) => b - a),
              departments: departments.map((d) => ({ id: d.id, code: d.code, name: d.name })),
              products: Array.from(productSet).sort(),
              customers: customers.map((c) => ({ id: c.id, code: c.code, name: c.name })),
            },
            projectsByProvince,
            poMonitoring: {
              rows: poRows,
              grandTotalReleased: grandReleased,
              grandTotalDelivered: grandDelivered,
              totalPoValue: totalPoValue.toFixed(2),
              totalDeliveredValue: totalDeliveredValue.toFixed(2),
            },
            implementation: {
              complete: implComplete,
              inProgress: implInProgress,
              overallPercent: overallImplPct,
              buckets: implBuckets,
            },
            capexRealization: {
              overBudget,
              underBudget,
              overallPercent: overallCapexPct,
              buckets: capexBuckets,
            },
            generatedAt: new Date().toISOString(),
            cacheStatus: 'MISS',
          };
          return dto;
        },
      );
      return { ...value, cacheStatus };
    },
  );

  app.get(
    '/v1/reports/executive-summary/detail',
    { preHandler: [requireAuth] },
    async (req) => {
      const { dimension, value, limit } = ExecutiveDetailQuery.parse(req.query);
      const targetProvince = value.trim().toLowerCase();

      const productCategory = dimension === 'productCategory'
        ? z.enum(['CONNECTIVITY', 'DATACENTER', 'CLOUD', 'MANAGED_SERVICE', 'ICT_SOLUTION', 'OTHER']).parse(value)
        : null;

      const orders = await prisma.order.findMany({
        where: productCategory ? { productCategory } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true } },
          sos: {
            select: {
              sows: {
                select: {
                  progressPct: true,
                  warningLevel: true,
                  actualRfsDate: true,
                  sites: { select: { city: true, province: true } },
                },
              },
            },
          },
        },
      });

      const rows = orders
        .map((o) => {
          const sows = o.sos.flatMap((so) => so.sows);
          const sites = sows.flatMap((s) => s.sites);
          const provinces = Array.from(new Set(sites.map((s) => s.province?.trim() || provinceFromCity(s.city))));
          const avgProgress = sows.length
            ? Math.round((sows.reduce((a, s) => a + Number(s.progressPct ?? 0), 0) / sows.length) * 10) / 10
            : 0;
          const delivered = sows.length > 0 && sows.every((s) => !!s.actualRfsDate);
          const status = aggregateWarningLevel(sows.map((s) => s.warningLevel));
          const provinceMatched = dimension !== 'province'
            ? true
            : provinces.some((p) => p.toLowerCase() === targetProvince);

          return {
            orderId: o.id,
            orderNumber: o.orderNumber,
            customerName: o.customer?.name ?? '—',
            productCategory: o.productCategory,
            contractValue: Number(o.contractValue ?? 0),
            sowCount: sows.length,
            siteCount: sites.length,
            delivered,
            progressPct: avgProgress,
            status,
            provinces,
            provinceMatched,
          };
        })
        .filter((r) => r.provinceMatched)
        .slice(0, limit)
        .map(({ provinceMatched, ...r }) => r);

      const summary = rows.reduce(
        (acc, r) => {
          acc.totalOrders += 1;
          acc.totalSows += r.sowCount;
          acc.totalSites += r.siteCount;
          acc.totalContractValue += r.contractValue;
          if (r.delivered) acc.deliveredOrders += 1;
          return acc;
        },
        { totalOrders: 0, totalSows: 0, totalSites: 0, deliveredOrders: 0, totalContractValue: 0 },
      );

      return {
        dimension,
        value,
        generatedAt: new Date().toISOString(),
        summary,
        rows,
      };
    },
  );

  // ===========================================================================
  // PARTNER DELIVERY STATUS — per-project rows for partners view.
  // ===========================================================================
  app.get(
    '/v1/reports/partner-delivery',
    { preHandler: [requireAuth] },
    async () => {
      const { value, cacheStatus } = await cache.getOrBuild<PartnerDeliveryReportDto>(
        KEY_PARTNER,
        TTL_REPORT,
        async () => {
          const orders = await prisma.order.findMany({
            select: {
              id: true,
              orderNumber: true,
              description: true,
              productCategory: true,
              capexBudget: true,
              customer: { select: { name: true } },
              sos: {
                select: {
                  id: true,
                  capexBudgets: { select: { id: true } },
                  sows: {
                    select: {
                      id: true,
                      progressPct: true,
                      warningLevel: true,
                      warningReason: true,
                      gapDays: true,
                      sites: { select: { name: true, code: true } },
                      vendorAssignments: { select: { vendor: { select: { name: true } } } },
                      milestones: {
                        select: {
                          type: true,
                          status: true,
                          planDate: true,
                          overdueDays: true,
                          blockedReason: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          const allBudgetIds: string[] = [];
          for (const o of orders)
            for (const so of o.sos)
              for (const b of so.capexBudgets) allBudgetIds.push(b.id);
          const entries = allBudgetIds.length
            ? await prisma.capexEntry.findMany({
                where: { capexBudgetId: { in: allBudgetIds } },
                select: { capexBudgetId: true, amount: true },
              })
            : [];
          const spentByBudget = new Map<string, number>();
          for (const e of entries) {
            spentByBudget.set(
              e.capexBudgetId,
              (spentByBudget.get(e.capexBudgetId) ?? 0) + Number(e.amount),
            );
          }

          const rows: PartnerDeliveryRowDto[] = orders.map((o) => {
            const allSows = o.sos.flatMap((s) => s.sows);
            const implPct = allSows.length
              ? Math.round(
                  (allSows.reduce((a, s) => a + Number(s.progressPct ?? 0), 0) / allSows.length) * 10,
                ) / 10
              : 0;

            const totalSpent = o.sos
              .flatMap((s) => s.capexBudgets)
              .reduce((a, b) => a + (spentByBudget.get(b.id) ?? 0), 0);
            const budget = Number(o.capexBudget ?? 0);
            const capexPct = budget > 0 ? Math.round((totalSpent / budget) * 1000) / 10 : 0;
            const capexHealth: 'OK' | 'OVER' = capexPct > 100 ? 'OVER' : 'OK';

            const levels = allSows.map((s) => s.warningLevel);
            const warningLevel = levels.includes('DELAY')
              ? 'DELAY'
              : levels.includes('AT_RISK')
                ? 'AT_RISK'
                : 'ON_TRACK';

            let critical = '-';
            const worstSow = allSows.slice().sort((a, b) => (b.gapDays ?? 0) - (a.gapDays ?? 0))[0];
            if (worstSow) {
              const blocked = worstSow.milestones.find(
                (m) => m.status === 'BLOCKED' && m.blockedReason,
              );
              const overdue = worstSow.milestones
                .filter((m) => m.status !== 'DONE' && (m.overdueDays ?? 0) > 0)
                .sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0))[0];
              if (blocked && blocked.blockedReason) critical = `Blocked: ${blocked.blockedReason}`;
              else if (overdue) critical = `${overdue.type} overdue ${overdue.overdueDays}d`;
              else if (worstSow.warningReason) critical = worstSow.warningReason;
              else if ((worstSow.gapDays ?? 0) > 0) critical = `Gap ${worstSow.gapDays} day(s) vs plan`;
            }

            const vendorNames = Array.from(
              new Set(allSows.flatMap((s) => s.vendorAssignments.map((va) => va.vendor.name))),
            );
            const siteNames = Array.from(
              new Set(
                allSows.flatMap((s) => s.sites.flatMap((site) => [site.name, site.code])),
              ),
            );
            const projectName = `${prettifyCategory(o.productCategory as ProductCategory)} - ${o.customer.name}`;

            return {
              orderId: o.id,
              orderNumber: o.orderNumber,
              projectName,
              productCategory: o.productCategory as ProductCategory,
              customerName: o.customer.name,
              siteNames,
              vendorNames,
              implementationPct: implPct,
              capexRealizationPct: capexPct,
              capexHealth,
              warningLevel,
              criticalIssue: critical,
            };
          });

          rows.sort((a, b) => a.projectName.localeCompare(b.projectName));

          const dto: PartnerDeliveryReportDto = {
            rows,
            generatedAt: new Date().toISOString(),
            cacheStatus: 'MISS',
          };
          return dto;
        },
      );
      return { ...value, cacheStatus };
    },
  );
}

function prettifyCategory(cat: ProductCategory): string {
  switch (cat) {
    case 'CONNECTIVITY': return 'Connectivity';
    case 'DATACENTER': return 'Data Center';
    case 'CLOUD': return 'Cloud';
    case 'MANAGED_SERVICE': return 'Managed Service';
    case 'ICT_SOLUTION': return 'ICT Solution';
    case 'OTHER': return 'Other';
    default: return cat;
  }
}
