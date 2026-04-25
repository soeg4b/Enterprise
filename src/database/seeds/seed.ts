// =============================================================================
// PDC Enterprise — Demo seed
// Idempotent: re-runnable; uses upsert by natural key.
// Loads a realistic multi-team portfolio (PPO1..PPO5 style) covering ON_TRACK,
// AT_RISK and DELAY scenarios across customers and field engineers, and
// pre-computes SOW/Site warning levels so the BOD dashboard has live numbers
// even before the milestone worker has run.
// =============================================================================

import {
  PrismaClient,
  MilestoneType,
  MilestoneStatus,
  OrderType,
  ProductCategory,
  SiteType,
  ClaimType,
  ClaimStatus,
  CapexCategory,
  OverallStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import dayjs, { Dayjs } from 'dayjs';

import {
  MILESTONE_SEQUENCE,
  MILESTONE_WEIGHTS,
  MILESTONE_PLAN_OFFSETS_DAYS,
} from 'deliveriq-shared';
import {
  computeProgressPercent,
  computeGapDayToRfs,
  computeOverallStatus,
  type EngineMilestone,
} from '../../backend/src/engine/milestone';

const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@deliveriq.local';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';
const SEED_ADMIN_FULLNAME = process.env.SEED_ADMIN_FULLNAME ?? 'System Administrator';
const BCRYPT_COST = Number.parseInt(process.env.BCRYPT_COST ?? '12', 10);
const DEFAULT_PASSWORD = 'Passw0rd!';
const TODAY = dayjs();

type SeqPlanItem = {
  type: MilestoneType;
  status: MilestoneStatus;
  /** Days actual was completed AFTER the planned offset (positive = late). */
  actualOffsetDays?: number;
};

type SiteSpec = {
  code: string;
  name: string;
  type: SiteType;
  city: string;
  province: string;
  lat: number;
  lng: number;
  field: 'field1' | 'field2';
};

type SowSpec = {
  number: string;
  scope: string;
  /** Days from TODAY to planned RFS (positive = future, negative = past due). */
  rfsOffsetDays: number;
  site: SiteSpec;
  vendor: 'mitraA' | 'mitraB' | 'mitraC';
  vendorAmount: number;
  spkNumber: string;
  poNumber: string;
  plan: SeqPlanItem[];
  claim?: { type: ClaimType; amount: number; status: ClaimStatus; periodMonth?: number; periodYear?: number };
};

type OrderSpec = {
  number: string;
  customer: 'mandiri' | 'bca' | 'pertamina' | 'pln' | 'pelindo' | 'telkom';
  department: 'ent' | 'pres';
  pm: 'pm1' | 'pm2';
  type: OrderType;
  productCategory: ProductCategory;
  description: string;
  contractValue: number;
  otc: number;
  mrc: number;
  capex: number;
  startDate: string;
  endDate: string;
  sows: SowSpec[];
};

// ---------------------------------------------------------------------------
// Sequence plan helpers
// ---------------------------------------------------------------------------

function planAllDone(): SeqPlanItem[] {
  return MILESTONE_SEQUENCE.map<SeqPlanItem>((t) => ({ type: t, status: 'DONE', actualOffsetDays: 0 }));
}

function planThrough(idx: number, lateDaysOnDone: number = 0): SeqPlanItem[] {
  return MILESTONE_SEQUENCE.map<SeqPlanItem>((t, i) => {
    if (i < idx) return { type: t, status: 'DONE', actualOffsetDays: lateDaysOnDone };
    if (i === idx) return { type: t, status: 'IN_PROGRESS' };
    return { type: t, status: 'NOT_STARTED' };
  });
}

// ---------------------------------------------------------------------------
// Demo portfolio
// ---------------------------------------------------------------------------

const ORDERS: OrderSpec[] = [
  {
    number: 'PPO1-001',
    customer: 'mandiri',
    department: 'ent',
    pm: 'pm1',
    type: 'NEW',
    productCategory: 'CONNECTIVITY',
    description: 'MPLS rollout — Bank Mandiri Jakarta cluster',
    contractValue: 12_500_000_000,
    otc: 7_200_000_000,
    mrc: 400_000_000,
    capex: 3_100_000_000,
    startDate: '2026-01-15',
    endDate: '2026-12-31',
    sows: [
      {
        number: 'SOW-PPO1-001-A',
        scope: 'JKT-NE-12 primary install',
        rfsOffsetDays: 35,
        vendor: 'mitraA',
        vendorAmount: 850_000_000,
        spkNumber: 'SPK-PPO1-A',
        poNumber: 'PO-PPO1-A',
        site: { code: 'JKT-NE-12', name: 'Jakarta NE 12 — Sudirman', type: 'NE', city: 'Jakarta', province: 'DKI Jakarta', lat: -6.21, lng: 106.85, field: 'field1' },
        plan: planThrough(3),
        claim: { type: 'OTC', amount: 3_600_000_000, status: 'PENDING' },
      },
      {
        number: 'SOW-PPO1-001-B',
        scope: 'BDG-FE-07 last-mile install',
        rfsOffsetDays: 18,
        vendor: 'mitraB',
        vendorAmount: 620_000_000,
        spkNumber: 'SPK-PPO1-B',
        poNumber: 'PO-PPO1-B',
        site: { code: 'BDG-FE-07', name: 'Bandung FE 07 — Asia Afrika', type: 'FE', city: 'Bandung', province: 'Jawa Barat', lat: -6.92, lng: 107.61, field: 'field2' },
        plan: planThrough(6, 2),
        claim: { type: 'MRC', amount: 12_000_000, status: 'PENDING', periodMonth: 4, periodYear: 2026 },
      },
    ],
  },
  {
    number: 'PPO2-014',
    customer: 'bca',
    department: 'ent',
    pm: 'pm1',
    type: 'UPGRADE',
    productCategory: 'CONNECTIVITY',
    description: 'Metro-E uplift — BCA Surabaya branches',
    contractValue: 8_750_000_000,
    otc: 4_200_000_000,
    mrc: 280_000_000,
    capex: 1_900_000_000,
    startDate: '2026-02-01',
    endDate: '2026-09-30',
    sows: [
      {
        number: 'SOW-PPO2-014-A',
        scope: 'SBY-NE-03 metro upgrade',
        rfsOffsetDays: -8,
        vendor: 'mitraC',
        vendorAmount: 450_000_000,
        spkNumber: 'SPK-PPO2-A',
        poNumber: 'PO-PPO2-A',
        site: { code: 'SBY-NE-03', name: 'Surabaya NE 03 — Pemuda', type: 'NE', city: 'Surabaya', province: 'Jawa Timur', lat: -7.27, lng: 112.73, field: 'field1' },
        plan: planThrough(7, 5),
      },
    ],
  },
  {
    number: 'PPO3-007',
    customer: 'pertamina',
    department: 'ent',
    pm: 'pm2',
    type: 'NEW',
    productCategory: 'DATACENTER',
    description: 'Disaster-recovery DC interconnect — Pertamina',
    contractValue: 21_000_000_000,
    otc: 14_000_000_000,
    mrc: 700_000_000,
    capex: 5_400_000_000,
    startDate: '2026-03-01',
    endDate: '2027-02-28',
    sows: [
      {
        number: 'SOW-PPO3-007-A',
        scope: 'JKT DC primary build-out',
        rfsOffsetDays: 60,
        vendor: 'mitraA',
        vendorAmount: 2_100_000_000,
        spkNumber: 'SPK-PPO3-A',
        poNumber: 'PO-PPO3-A',
        site: { code: 'JKT-DC-01', name: 'Jakarta DC 01 — Cibitung', type: 'NE', city: 'Bekasi', province: 'Jawa Barat', lat: -6.27, lng: 107.09, field: 'field1' },
        plan: planThrough(2),
        claim: { type: 'OTC', amount: 7_000_000_000, status: 'PENDING' },
      },
      {
        number: 'SOW-PPO3-007-B',
        scope: 'BDG DC secondary build-out',
        rfsOffsetDays: 75,
        vendor: 'mitraB',
        vendorAmount: 1_750_000_000,
        spkNumber: 'SPK-PPO3-B',
        poNumber: 'PO-PPO3-B',
        site: { code: 'BDG-DC-02', name: 'Bandung DC 02 — Cimahi', type: 'FE', city: 'Bandung', province: 'Jawa Barat', lat: -6.88, lng: 107.54, field: 'field2' },
        plan: planThrough(1),
      },
    ],
  },
  {
    number: 'PPO4-022',
    customer: 'pln',
    department: 'pres',
    pm: 'pm2',
    type: 'NEW',
    productCategory: 'MANAGED_SERVICE',
    description: 'Managed network — PLN regional offices',
    contractValue: 4_500_000_000,
    otc: 2_000_000_000,
    mrc: 175_000_000,
    capex: 900_000_000,
    startDate: '2026-01-05',
    endDate: '2026-06-30',
    sows: [
      {
        number: 'SOW-PPO4-022-A',
        scope: 'Medan regional install (HANDOVER)',
        rfsOffsetDays: -45,
        vendor: 'mitraC',
        vendorAmount: 380_000_000,
        spkNumber: 'SPK-PPO4-A',
        poNumber: 'PO-PPO4-A',
        site: { code: 'MDN-NE-01', name: 'Medan NE 01 — Lapangan Merdeka', type: 'NE', city: 'Medan', province: 'Sumatera Utara', lat: 3.59, lng: 98.67, field: 'field1' },
        plan: planAllDone(),
        claim: { type: 'OTC', amount: 2_000_000_000, status: 'PAID' },
      },
    ],
  },
  {
    number: 'PPO5-009',
    customer: 'pelindo',
    department: 'ent',
    pm: 'pm1',
    type: 'NEW',
    productCategory: 'ICT_SOLUTION',
    description: 'Smart-port ICT — Pelindo Makassar',
    contractValue: 6_300_000_000,
    otc: 3_100_000_000,
    mrc: 220_000_000,
    capex: 1_400_000_000,
    startDate: '2026-02-20',
    endDate: '2026-11-30',
    sows: [
      {
        number: 'SOW-PPO5-009-A',
        scope: 'Makassar terminal NE install',
        rfsOffsetDays: 12,
        vendor: 'mitraA',
        vendorAmount: 540_000_000,
        spkNumber: 'SPK-PPO5-A',
        poNumber: 'PO-PPO5-A',
        site: { code: 'MKS-NE-04', name: 'Makassar NE 04 — Soekarno Hatta Port', type: 'NE', city: 'Makassar', province: 'Sulawesi Selatan', lat: -5.13, lng: 119.41, field: 'field2' },
        plan: planThrough(4),
      },
      {
        number: 'SOW-PPO5-009-B',
        scope: 'Makassar terminal FE install',
        rfsOffsetDays: 22,
        vendor: 'mitraB',
        vendorAmount: 410_000_000,
        spkNumber: 'SPK-PPO5-B',
        poNumber: 'PO-PPO5-B',
        site: { code: 'MKS-FE-09', name: 'Makassar FE 09 — KIMA Industrial', type: 'FE', city: 'Makassar', province: 'Sulawesi Selatan', lat: -5.10, lng: 119.45, field: 'field1' },
        plan: planThrough(5),
      },
    ],
  },
  // ===========================================================================
  // Extended portfolio — 15 additional orders for full 20-program demo
  // Status mix: ~ON_TRACK 8, AT_RISK 6, DELAY 6 (computed by engine)
  // ===========================================================================
  {
    number: 'PPO6-031', customer: 'mandiri', department: 'ent', pm: 'pm2',
    type: 'UPGRADE', productCategory: 'CONNECTIVITY',
    description: 'Mandiri branch network refresh — Yogyakarta cluster',
    contractValue: 5_800_000_000, otc: 2_400_000_000, mrc: 195_000_000, capex: 1_250_000_000,
    startDate: '2026-02-10', endDate: '2026-10-31',
    sows: [
      {
        number: 'SOW-PPO6-031-A', scope: 'YGY-NE-22 metro upgrade', rfsOffsetDays: 45,
        vendor: 'mitraA', vendorAmount: 480_000_000, spkNumber: 'SPK-PPO6-A', poNumber: 'PO-PPO6-A',
        site: { code: 'YGY-NE-22', name: 'Yogyakarta NE 22 — Malioboro', type: 'NE', city: 'Yogyakarta', province: 'DI Yogyakarta', lat: -7.79, lng: 110.37, field: 'field1' },
        plan: planThrough(3),
      },
    ],
  },
  {
    number: 'PPO7-044', customer: 'bca', department: 'ent', pm: 'pm1',
    type: 'NEW', productCategory: 'CONNECTIVITY',
    description: 'BCA Bali resort branches connectivity',
    contractValue: 3_900_000_000, otc: 1_800_000_000, mrc: 145_000_000, capex: 850_000_000,
    startDate: '2026-03-01', endDate: '2026-08-31',
    sows: [
      {
        number: 'SOW-PPO7-044-A', scope: 'DPS-FE-11 last-mile install', rfsOffsetDays: 8,
        vendor: 'mitraB', vendorAmount: 320_000_000, spkNumber: 'SPK-PPO7-A', poNumber: 'PO-PPO7-A',
        site: { code: 'DPS-FE-11', name: 'Denpasar FE 11 — Sanur', type: 'FE', city: 'Denpasar', province: 'Bali', lat: -8.69, lng: 115.26, field: 'field2' },
        plan: planThrough(7, 3),
        claim: { type: 'MRC', amount: 9_500_000, status: 'SUBMITTED', periodMonth: 4, periodYear: 2026 },
      },
    ],
  },
  {
    number: 'PPO8-058', customer: 'pertamina', department: 'pres', pm: 'pm2',
    type: 'NEW', productCategory: 'CLOUD',
    description: 'Pertamina hybrid-cloud landing zone',
    contractValue: 18_500_000_000, otc: 11_000_000_000, mrc: 620_000_000, capex: 4_300_000_000,
    startDate: '2026-01-20', endDate: '2026-12-15',
    sows: [
      {
        number: 'SOW-PPO8-058-A', scope: 'JKT cloud edge POP-A', rfsOffsetDays: 90,
        vendor: 'mitraC', vendorAmount: 1_900_000_000, spkNumber: 'SPK-PPO8-A', poNumber: 'PO-PPO8-A',
        site: { code: 'JKT-POP-15', name: 'Jakarta POP 15 — Kuningan', type: 'POP', city: 'Jakarta', province: 'DKI Jakarta', lat: -6.23, lng: 106.83, field: 'field1' },
        plan: planThrough(2),
        claim: { type: 'OTC', amount: 5_500_000_000, status: 'PENDING' },
      },
      {
        number: 'SOW-PPO8-058-B', scope: 'SBY cloud edge POP-B', rfsOffsetDays: 100,
        vendor: 'mitraA', vendorAmount: 1_700_000_000, spkNumber: 'SPK-PPO8-B', poNumber: 'PO-PPO8-B',
        site: { code: 'SBY-POP-08', name: 'Surabaya POP 08 — Tunjungan', type: 'POP', city: 'Surabaya', province: 'Jawa Timur', lat: -7.26, lng: 112.74, field: 'field2' },
        plan: planThrough(1),
      },
    ],
  },
  {
    number: 'PPO9-066', customer: 'pln', department: 'ent', pm: 'pm1',
    type: 'NEW', productCategory: 'MANAGED_SERVICE',
    description: 'PLN substation SCADA backhaul — Java East',
    contractValue: 9_200_000_000, otc: 4_800_000_000, mrc: 320_000_000, capex: 2_100_000_000,
    startDate: '2026-02-05', endDate: '2026-11-15',
    sows: [
      {
        number: 'SOW-PPO9-066-A', scope: 'Malang substation backhaul', rfsOffsetDays: -12,
        vendor: 'mitraB', vendorAmount: 720_000_000, spkNumber: 'SPK-PPO9-A', poNumber: 'PO-PPO9-A',
        site: { code: 'MLG-NE-05', name: 'Malang NE 05 — Substation Sengkaling', type: 'NE', city: 'Malang', province: 'Jawa Timur', lat: -7.93, lng: 112.61, field: 'field1' },
        plan: planThrough(6, 8),
      },
    ],
  },
  {
    number: 'PPO10-073', customer: 'pelindo', department: 'ent', pm: 'pm2',
    type: 'UPGRADE', productCategory: 'ICT_SOLUTION',
    description: 'Pelindo Belawan port automation upgrade',
    contractValue: 7_400_000_000, otc: 3_600_000_000, mrc: 245_000_000, capex: 1_700_000_000,
    startDate: '2026-02-15', endDate: '2026-11-20',
    sows: [
      {
        number: 'SOW-PPO10-073-A', scope: 'Belawan terminal SCADA install', rfsOffsetDays: 28,
        vendor: 'mitraC', vendorAmount: 640_000_000, spkNumber: 'SPK-PPO10-A', poNumber: 'PO-PPO10-A',
        site: { code: 'BLW-NE-02', name: 'Belawan NE 02 — Port Authority', type: 'NE', city: 'Medan', province: 'Sumatera Utara', lat: 3.78, lng: 98.69, field: 'field2' },
        plan: planThrough(4),
      },
    ],
  },
  {
    number: 'PPO11-080', customer: 'mandiri', department: 'pres', pm: 'pm1',
    type: 'NEW', productCategory: 'DATACENTER',
    description: 'Mandiri DR site colocation — Surabaya',
    contractValue: 14_200_000_000, otc: 8_500_000_000, mrc: 480_000_000, capex: 3_400_000_000,
    startDate: '2026-01-10', endDate: '2026-10-31',
    sows: [
      {
        number: 'SOW-PPO11-080-A', scope: 'SBY DR colocation rack build', rfsOffsetDays: -3,
        vendor: 'mitraA', vendorAmount: 1_400_000_000, spkNumber: 'SPK-PPO11-A', poNumber: 'PO-PPO11-A',
        site: { code: 'SBY-DC-04', name: 'Surabaya DC 04 — Rungkut', type: 'NE', city: 'Surabaya', province: 'Jawa Timur', lat: -7.32, lng: 112.78, field: 'field1' },
        plan: planThrough(7, 6),
        claim: { type: 'OTC', amount: 4_250_000_000, status: 'SUBMITTED' },
      },
    ],
  },
  {
    number: 'PPO12-091', customer: 'bca', department: 'ent', pm: 'pm2',
    type: 'RENEWAL', productCategory: 'CONNECTIVITY',
    description: 'BCA SD-WAN renewal — Sumatera region',
    contractValue: 6_700_000_000, otc: 2_800_000_000, mrc: 230_000_000, capex: 1_300_000_000,
    startDate: '2026-03-15', endDate: '2027-03-14',
    sows: [
      {
        number: 'SOW-PPO12-091-A', scope: 'Palembang hub SD-WAN', rfsOffsetDays: 55,
        vendor: 'mitraB', vendorAmount: 540_000_000, spkNumber: 'SPK-PPO12-A', poNumber: 'PO-PPO12-A',
        site: { code: 'PLM-NE-07', name: 'Palembang NE 07 — Sudirman', type: 'NE', city: 'Palembang', province: 'Sumatera Selatan', lat: -2.99, lng: 104.76, field: 'field2' },
        plan: planThrough(2),
      },
    ],
  },
  {
    number: 'PPO13-104', customer: 'pertamina', department: 'ent', pm: 'pm1',
    type: 'NEW', productCategory: 'CONNECTIVITY',
    description: 'Pertamina refinery LAN backbone — Balikpapan',
    contractValue: 11_800_000_000, otc: 6_200_000_000, mrc: 410_000_000, capex: 2_900_000_000,
    startDate: '2026-02-25', endDate: '2026-12-20',
    sows: [
      {
        number: 'SOW-PPO13-104-A', scope: 'Balikpapan refinery NE backbone', rfsOffsetDays: 5,
        vendor: 'mitraA', vendorAmount: 1_080_000_000, spkNumber: 'SPK-PPO13-A', poNumber: 'PO-PPO13-A',
        site: { code: 'BPN-NE-13', name: 'Balikpapan NE 13 — Refinery', type: 'NE', city: 'Balikpapan', province: 'Kalimantan Timur', lat: -1.27, lng: 116.83, field: 'field1' },
        plan: planThrough(7, 4),
        claim: { type: 'OTC', amount: 3_100_000_000, status: 'PENDING' },
      },
    ],
  },
  {
    number: 'PPO14-118', customer: 'pln', department: 'ent', pm: 'pm2',
    type: 'UPGRADE', productCategory: 'MANAGED_SERVICE',
    description: 'PLN data center managed services — Bali',
    contractValue: 3_200_000_000, otc: 1_300_000_000, mrc: 115_000_000, capex: 720_000_000,
    startDate: '2026-01-25', endDate: '2026-07-31',
    sows: [
      {
        number: 'SOW-PPO14-118-A', scope: 'Denpasar DC managed handover', rfsOffsetDays: -55,
        vendor: 'mitraC', vendorAmount: 290_000_000, spkNumber: 'SPK-PPO14-A', poNumber: 'PO-PPO14-A',
        site: { code: 'DPS-NE-19', name: 'Denpasar NE 19 — Renon', type: 'NE', city: 'Denpasar', province: 'Bali', lat: -8.68, lng: 115.24, field: 'field2' },
        plan: planAllDone(),
        claim: { type: 'OTC', amount: 1_300_000_000, status: 'PAID' },
      },
    ],
  },
  {
    number: 'PPO15-127', customer: 'pelindo', department: 'pres', pm: 'pm1',
    type: 'NEW', productCategory: 'CLOUD',
    description: 'Pelindo cloud workload migration — JKT',
    contractValue: 8_900_000_000, otc: 4_500_000_000, mrc: 305_000_000, capex: 2_050_000_000,
    startDate: '2026-03-05', endDate: '2026-12-10',
    sows: [
      {
        number: 'SOW-PPO15-127-A', scope: 'Tanjung Priok cloud edge POP', rfsOffsetDays: 40,
        vendor: 'mitraB', vendorAmount: 850_000_000, spkNumber: 'SPK-PPO15-A', poNumber: 'PO-PPO15-A',
        site: { code: 'JKT-POP-21', name: 'Jakarta POP 21 — Tanjung Priok', type: 'POP', city: 'Jakarta', province: 'DKI Jakarta', lat: -6.10, lng: 106.88, field: 'field1' },
        plan: planThrough(3),
      },
    ],
  },
  {
    number: 'PPO16-135', customer: 'mandiri', department: 'ent', pm: 'pm1',
    type: 'NEW', productCategory: 'CONNECTIVITY',
    description: 'Mandiri ATM network expansion — Sulawesi',
    contractValue: 4_100_000_000, otc: 1_900_000_000, mrc: 155_000_000, capex: 920_000_000,
    startDate: '2026-03-10', endDate: '2026-09-30',
    sows: [
      {
        number: 'SOW-PPO16-135-A', scope: 'Manado ATM uplink install', rfsOffsetDays: 14,
        vendor: 'mitraA', vendorAmount: 360_000_000, spkNumber: 'SPK-PPO16-A', poNumber: 'PO-PPO16-A',
        site: { code: 'MND-FE-06', name: 'Manado FE 06 — Boulevard', type: 'FE', city: 'Manado', province: 'Sulawesi Utara', lat: 1.49, lng: 124.84, field: 'field2' },
        plan: planThrough(6, 2),
      },
    ],
  },
  {
    number: 'PPO17-142', customer: 'bca', department: 'ent', pm: 'pm2',
    type: 'NEW', productCategory: 'DATACENTER',
    description: 'BCA secondary DC fiber ring — Bandung',
    contractValue: 16_500_000_000, otc: 9_800_000_000, mrc: 545_000_000, capex: 3_900_000_000,
    startDate: '2026-01-08', endDate: '2026-12-31',
    sows: [
      {
        number: 'SOW-PPO17-142-A', scope: 'Bandung DC fiber primary loop', rfsOffsetDays: -20,
        vendor: 'mitraC', vendorAmount: 1_650_000_000, spkNumber: 'SPK-PPO17-A', poNumber: 'PO-PPO17-A',
        site: { code: 'BDG-DC-08', name: 'Bandung DC 08 — Dago', type: 'NE', city: 'Bandung', province: 'Jawa Barat', lat: -6.89, lng: 107.61, field: 'field1' },
        plan: planThrough(7, 12),
        claim: { type: 'OTC', amount: 4_900_000_000, status: 'SUBMITTED' },
      },
      {
        number: 'SOW-PPO17-142-B', scope: 'Bandung DC fiber secondary loop', rfsOffsetDays: 35,
        vendor: 'mitraA', vendorAmount: 1_420_000_000, spkNumber: 'SPK-PPO17-B', poNumber: 'PO-PPO17-B',
        site: { code: 'BDG-DC-09', name: 'Bandung DC 09 — Pasteur', type: 'NE', city: 'Bandung', province: 'Jawa Barat', lat: -6.90, lng: 107.59, field: 'field2' },
        plan: planThrough(3),
      },
    ],
  },
  {
    number: 'PPO18-156', customer: 'pertamina', department: 'ent', pm: 'pm1',
    type: 'RELOCATION', productCategory: 'CONNECTIVITY',
    description: 'Pertamina HQ relocation — Gatot Subroto',
    contractValue: 2_800_000_000, otc: 1_400_000_000, mrc: 95_000_000, capex: 620_000_000,
    startDate: '2026-02-28', endDate: '2026-06-30',
    sows: [
      {
        number: 'SOW-PPO18-156-A', scope: 'HQ relocation MPLS cutover', rfsOffsetDays: -2,
        vendor: 'mitraB', vendorAmount: 240_000_000, spkNumber: 'SPK-PPO18-A', poNumber: 'PO-PPO18-A',
        site: { code: 'JKT-NE-28', name: 'Jakarta NE 28 — Gatot Subroto', type: 'NE', city: 'Jakarta', province: 'DKI Jakarta', lat: -6.23, lng: 106.81, field: 'field1' },
        plan: planThrough(7, 5),
      },
    ],
  },
  {
    number: 'PPO19-167', customer: 'pln', department: 'pres', pm: 'pm2',
    type: 'NEW', productCategory: 'ICT_SOLUTION',
    description: 'PLN smart-grid IoT gateways — West Java',
    contractValue: 5_500_000_000, otc: 2_600_000_000, mrc: 185_000_000, capex: 1_200_000_000,
    startDate: '2026-03-01', endDate: '2026-11-30',
    sows: [
      {
        number: 'SOW-PPO19-167-A', scope: 'Bekasi IoT gateway cluster install', rfsOffsetDays: 25,
        vendor: 'mitraA', vendorAmount: 480_000_000, spkNumber: 'SPK-PPO19-A', poNumber: 'PO-PPO19-A',
        site: { code: 'BKS-FE-14', name: 'Bekasi FE 14 — Cikarang', type: 'FE', city: 'Bekasi', province: 'Jawa Barat', lat: -6.26, lng: 107.16, field: 'field2' },
        plan: planThrough(4),
      },
    ],
  },
  {
    number: 'PPO20-178', customer: 'pelindo', department: 'ent', pm: 'pm1',
    type: 'NEW', productCategory: 'CONNECTIVITY',
    description: 'Pelindo Tanjung Perak fiber upgrade — Surabaya',
    contractValue: 7_900_000_000, otc: 3_900_000_000, mrc: 265_000_000, capex: 1_800_000_000,
    startDate: '2026-02-12', endDate: '2026-12-05',
    sows: [
      {
        number: 'SOW-PPO20-178-A', scope: 'Tanjung Perak NE primary install', rfsOffsetDays: 18,
        vendor: 'mitraC', vendorAmount: 690_000_000, spkNumber: 'SPK-PPO20-A', poNumber: 'PO-PPO20-A',
        site: { code: 'SBY-NE-17', name: 'Surabaya NE 17 — Tanjung Perak', type: 'NE', city: 'Surabaya', province: 'Jawa Timur', lat: -7.20, lng: 112.74, field: 'field1' },
        plan: planThrough(5),
        claim: { type: 'MRC', amount: 11_500_000, status: 'PENDING', periodMonth: 4, periodYear: 2026 },
      },
      {
        number: 'SOW-PPO20-178-B', scope: 'Tanjung Perak FE backup install', rfsOffsetDays: 32,
        vendor: 'mitraB', vendorAmount: 510_000_000, spkNumber: 'SPK-PPO20-B', poNumber: 'PO-PPO20-B',
        site: { code: 'SBY-FE-18', name: 'Surabaya FE 18 — Perak Timur', type: 'FE', city: 'Surabaya', province: 'Jawa Timur', lat: -7.21, lng: 112.75, field: 'field2' },
        plan: planThrough(3),
      },
    ],
  },
  // ===========================================================================
  // PPO21 — PT Telkom Akses BSD Backbone Rollout
  // This order's primary SOW is the *Fiber Optic Pole Tagging* scope wired up
  // to the in-memory fiber-projects module (project id `fp-bsd-loop-001`).
  // The on-site mitra workflow (photos with EXIF GPS → poles on map) opens
  // from this order's detail page.
  // ===========================================================================
  {
    number: 'PPO21-201', customer: 'telkom', department: 'ent', pm: 'pm1',
    type: 'NEW', productCategory: 'CONNECTIVITY',
    description: 'BSD Backbone Rollout 2026 — fiber optic backbone NE→FE (BSD cluster). Termasuk pole tagging mitra, civil work, OLT/splitter install, dan acceptance testing OTDR.',
    contractValue: 4_750_000_000, otc: 3_900_000_000, mrc: 70_000_000, capex: 2_950_000_000,
    startDate: '2026-04-01', endDate: '2026-09-30',
    // Fiber optic link project dipecah jadi 3 scope:
    //   (A) Activity di Site A (Near End)
    //   (B) Activity di Link A–B (jalur kabel: civil, pull, splicing, OTDR)
    //   (C) Activity di Site B (Far End)
    sows: [
      {
        number: 'SOW-PPO21-201-A', scope: 'Site A (NE) — OLT & Rack Installation, Power, Grounding (BSD Junction Box A)',
        rfsOffsetDays: 38,
        vendor: 'mitraA', vendorAmount: 600_000_000,
        spkNumber: 'SPK-PPO21-A', poNumber: 'PO-PPO21-A',
        site: { code: 'BSD-NE-01', name: 'BSD Junction Box A — Boulevard Barat', type: 'NE', city: 'Tangerang Selatan', province: 'Banten', lat: -6.320116, lng: 106.666433, field: 'field1' },
        plan: planThrough(2),
        claim: { type: 'OTC', amount: 250_000_000, status: 'PENDING' },
      },
      {
        number: 'SOW-PPO21-201-B', scope: 'Link A–B — Pole Tagging, Civil Trenching/Duct, Cable Pulling & Splicing (BSD Loop)',
        rfsOffsetDays: 80,
        vendor: 'mitraA', vendorAmount: 1_500_000_000,
        spkNumber: 'SPK-PPO21-B', poNumber: 'PO-PPO21-B',
        site: { code: 'BSD-LNK-AB', name: 'BSD Link A–B — Boulevard Backbone Route', type: 'POP', city: 'Tangerang Selatan', province: 'Banten', lat: -6.317722, lng: 106.670901, field: 'field1' },
        plan: planThrough(1),
      },
      {
        number: 'SOW-PPO21-201-C', scope: 'Site B (FE) — ODP/Splitter Install, Patching & OTDR Acceptance (BSD Distribution Hub)',
        rfsOffsetDays: 95,
        vendor: 'mitraA', vendorAmount: 500_000_000,
        spkNumber: 'SPK-PPO21-C', poNumber: 'PO-PPO21-C',
        site: { code: 'BSD-FE-01', name: 'BSD Distribution Hub — Grand Boulevard', type: 'FE', city: 'Tangerang Selatan', province: 'Banten', lat: -6.315328, lng: 106.675369, field: 'field2' },
        plan: planThrough(1),
      },
    ],
  },
];

function planDateFor(planRfs: Dayjs, type: MilestoneType): Date {
  return planRfs.subtract(MILESTONE_PLAN_OFFSETS_DAYS[type], 'day').toDate();
}

function actualDateFor(planDate: Date, lateDays: number = 0): Date {
  return dayjs(planDate).add(lateDays, 'day').toDate();
}

async function upsertUser(
  tenantId: string,
  email: string,
  fullName: string,
  role: 'AD' | 'BOD' | 'DH' | 'PM' | 'FE' | 'FN',
  departmentId: string | null,
  passwordHash: string,
  locale: string = 'id-ID',
) {
  return prisma.user.upsert({
    where: { tenantId_email: { tenantId, email } } as never,
    update: { fullName, role, departmentId, status: 'ACTIVE', passwordHash, locale },
    create: { email, passwordHash, fullName, role, departmentId, status: 'ACTIVE', locale, tenantId },
  });
}

async function main() {
  console.log('[seed] starting…');

  // 0. Default tenant
  const tenant = await prisma.tenant.upsert({
    where: { code: 'DEFAULT' },
    update: {},
    create: { code: 'DEFAULT', name: 'PDC Enterprise Demo' },
  });
  const T = tenant.id; // shorthand

  // 1. Departments
  const upsertDept = (code: string, name: string) =>
    prisma.department.upsert({
      where: { tenantId_code: { tenantId: T, code } } as never,
      update: { name },
      create: { code, name, tenantId: T },
    });
  const ent = await upsertDept('ENT', 'Enterprise');
  const pres = await upsertDept('PRES', 'PreSales');
  await upsertDept('TEL', 'Telecom Engineering');
  await upsertDept('PROJ', 'Project');

  // 2. Users
  const adminHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, BCRYPT_COST);
  const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_COST);

  const admin = await upsertUser(T, SEED_ADMIN_EMAIL, SEED_ADMIN_FULLNAME, 'AD', null, adminHash);
  await upsertUser(T, 'bod@deliveriq.local', 'Board Member', 'BOD', null, defaultHash);
  await upsertUser(T, 'dh.ent@deliveriq.local', 'Dept Head Enterprise', 'DH', ent.id, defaultHash);
  await upsertUser(T, 'dh.pres@deliveriq.local', 'Dept Head PreSales', 'DH', pres.id, defaultHash);
  const pm1 = await upsertUser(T, 'pm1@deliveriq.local', 'Andi Pratama', 'PM', ent.id, defaultHash);
  const pm2 = await upsertUser(T, 'pm2@deliveriq.local', 'Rina Wijaya', 'PM', ent.id, defaultHash);
  const field1 = await upsertUser(T, 'field1@deliveriq.local', 'Budi Santoso', 'FE', null, defaultHash);
  const field2 = await upsertUser(T, 'field2@deliveriq.local', 'Citra Lestari', 'FE', null, defaultHash);
  await upsertUser(T, 'finance@deliveriq.local', 'Finance Officer', 'FN', null, defaultHash);

  const users = { pm1, pm2, field1, field2 };
  const departments = { ent, pres };

  // 3. Customers
  const customerSeed: Record<string, { code: string; name: string; industry: string }> = {
    mandiri:   { code: 'CUST-MANDIRI',   name: 'PT Bank Mandiri',         industry: 'Banking' },
    bca:       { code: 'CUST-BCA',       name: 'PT Bank Central Asia',    industry: 'Banking' },
    pertamina: { code: 'CUST-PERTAMINA', name: 'PT Pertamina (Persero)',  industry: 'Energy' },
    pln:       { code: 'CUST-PLN',       name: 'PT PLN (Persero)',        industry: 'Utilities' },
    pelindo:   { code: 'CUST-PELINDO',   name: 'PT Pelabuhan Indonesia',  industry: 'Logistics' },
    telkom:    { code: 'CUST-TLKMAKSES', name: 'PT Telkom Akses',         industry: 'Telecommunications' },
  };
  const customers: Record<string, { id: string }> = {};
  for (const [k, c] of Object.entries(customerSeed)) {
    customers[k] = await prisma.customer.upsert({
      where: { tenantId_code: { tenantId: T, code: c.code } } as never,
      update: { name: c.name, industry: c.industry },
      create: { ...c, tenantId: T },
    });
  }

  // 4. Vendors
  const vendorSeed: Record<string, { code: string; name: string; picName: string; picPhone: string; picEmail: string }> = {
    mitraA: { code: 'MITRA-A', name: 'PT Mitra Telekomunikasi A', picName: 'Hendra (Mitra A)', picPhone: '+62-811-1000-001', picEmail: 'pm@mitraA.example' },
    mitraB: { code: 'MITRA-B', name: 'PT Mitra Telekomunikasi B', picName: 'Sari (Mitra B)',   picPhone: '+62-811-1000-002', picEmail: 'pm@mitraB.example' },
    mitraC: { code: 'MITRA-C', name: 'PT Mitra Telekomunikasi C', picName: 'Joko (Mitra C)',   picPhone: '+62-811-1000-003', picEmail: 'pm@mitraC.example' },
  };
  const vendors: Record<string, { id: string }> = {};
  for (const [k, v] of Object.entries(vendorSeed)) {
    vendors[k] = await prisma.vendor.upsert({
      where: { tenantId_code: { tenantId: T, code: v.code } } as never,
      update: { name: v.name, picName: v.picName, picPhone: v.picPhone, picEmail: v.picEmail, isActive: true },
      create: { ...v, isActive: true, tenantId: T },
    });
  }

  // 5. Programs (one per customer)
  const programs: Record<string, { id: string }> = {};
  let progIdx = 0;
  for (const [k, c] of Object.entries(customers)) {
    progIdx += 1;
    const code = `PROG-${customerSeed[k]!.code.split('-')[1]}-2026`;
    const capex = 1_500_000_000 + progIdx * 600_000_000;
    const p = await prisma.program.upsert({
      where: { tenantId_code: { tenantId: T, code } } as never,
      update: {},
      create: {
        code,
        name: `${customerSeed[k]!.name} 2026 Connectivity Program`,
        customerId: c.id,
        departmentId: ent.id,
        tenantId: T,
        capexBudget: capex.toString() as never,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    programs[k] = { id: p.id };
  }

  // 6. Orders / SOs / SOWs / Sites / Vendor assignments / Milestones / Claims
  let totalSites = 0;
  let totalSows = 0;
  for (const o of ORDERS) {
    const dept = departments[o.department];
    const pm = users[o.pm];
    const order = await prisma.order.upsert({
      where: { tenantId_orderNumber: { tenantId: T, orderNumber: o.number } } as never,
      update: {
        description: o.description,
        contractValue: o.contractValue.toString() as never,
        otcAmount: o.otc.toString() as never,
        mrcAmount: o.mrc.toString() as never,
        capexBudget: o.capex.toString() as never,
      },
      create: {
        orderNumber: o.number,
        programId: programs[o.customer]!.id,
        customerId: customers[o.customer]!.id,
        departmentId: dept.id,
        ownerUserId: pm.id,
        type: o.type,
        productCategory: o.productCategory,
        description: o.description,
        contractValue: o.contractValue.toString() as never,
        otcAmount: o.otc.toString() as never,
        mrcAmount: o.mrc.toString() as never,
        capexBudget: o.capex.toString() as never,
        startDate: new Date(o.startDate),
        endDate: new Date(o.endDate),
        signedAt: new Date(o.startDate),
        createdById: admin.id,
        tenantId: T,
      },
    });

    const soNumber = `SO-${o.number}`;
    const so = await prisma.sO.upsert({
      where: { tenantId_soNumber: { tenantId: T, soNumber } } as never,
      update: {},
      create: {
        soNumber,
        orderId: order.id,
        ownerUserId: pm.id,
        scope: o.description,
        startDate: new Date(o.startDate),
        endDate: new Date(o.endDate),
        tenantId: T,
      },
    });

    for (const sowSpec of o.sows) {
      totalSows += 1;
      const planRfs = TODAY.add(sowSpec.rfsOffsetDays, 'day');
      const allDone = sowSpec.plan.every((p) => p.status === 'DONE');
      const lastLate = sowSpec.plan[sowSpec.plan.length - 1]?.actualOffsetDays ?? 0;
      const actualRfs = allDone ? planRfs.add(lastLate, 'day').toDate() : null;

      const sow = await prisma.sOW.upsert({
        where: { tenantId_sowNumber: { tenantId: T, sowNumber: sowSpec.number } } as never,
        update: { scope: sowSpec.scope, planRfsDate: planRfs.toDate(), actualRfsDate: actualRfs },
        create: {
          sowNumber: sowSpec.number,
          soId: so.id,
          ownerUserId: pm.id,
          scope: sowSpec.scope,
          planRfsDate: planRfs.toDate(),
          actualRfsDate: actualRfs,
          tenantId: T,
        },
      });

      totalSites += 1;
      const fieldUser = users[sowSpec.site.field];
      const site = await prisma.site.upsert({
        where: { tenantId_code: { tenantId: T, code: sowSpec.site.code } } as never,
        update: { name: sowSpec.site.name, type: sowSpec.site.type, assignedFieldUserId: fieldUser.id },
        create: {
          code: sowSpec.site.code,
          name: sowSpec.site.name,
          sowId: sow.id,
          type: sowSpec.site.type,
          address: sowSpec.site.name,
          city: sowSpec.site.city,
          province: sowSpec.site.province,
          latitude: sowSpec.site.lat.toFixed(6) as never,
          longitude: sowSpec.site.lng.toFixed(6) as never,
          assignedFieldUserId: fieldUser.id,
          tenantId: T,
        },
      });

      const vendor = vendors[sowSpec.vendor]!;
      await prisma.vendorAssignment.upsert({
        where: {
          sowId_vendorId_spkNumber: { sowId: sow.id, vendorId: vendor.id, spkNumber: sowSpec.spkNumber },
        } as never,
        update: { amount: sowSpec.vendorAmount.toString() as never },
        create: {
          sowId: sow.id,
          vendorId: vendor.id,
          spkNumber: sowSpec.spkNumber,
          spkDate: TODAY.subtract(45, 'day').toDate(),
          poNumber: sowSpec.poNumber,
          poDate: TODAY.subtract(40, 'day').toDate(),
          amount: sowSpec.vendorAmount.toString() as never,
        },
      });

      const engineMilestones: EngineMilestone[] = [];
      for (let i = 0; i < MILESTONE_SEQUENCE.length; i++) {
        const type = MILESTONE_SEQUENCE[i]!;
        const planItem = sowSpec.plan[i]!;
        const planDate = planDateFor(planRfs, type);
        const actualDate =
          planItem.status === 'DONE' ? actualDateFor(planDate, planItem.actualOffsetDays ?? 0) : null;
        engineMilestones.push({ type, status: planItem.status, planDate, actualDate, weight: MILESTONE_WEIGHTS[type] });

        await prisma.milestone.upsert({
          where: { sowId_siteId_type: { sowId: sow.id, siteId: site.id, type } } as never,
          update: { status: planItem.status, planDate, actualDate },
          create: {
            sowId: sow.id,
            siteId: site.id,
            type,
            sequence: i + 1,
            weight: MILESTONE_WEIGHTS[type],
            status: planItem.status,
            planDate,
            actualDate,
          },
        });
      }

      const progress = computeProgressPercent(engineMilestones);
      const gap = computeGapDayToRfs({ planRfsDate: planRfs.toDate(), actualRfsDate: actualRfs }, TODAY.toDate());
      const warning = computeOverallStatus(
        { planRfsDate: planRfs.toDate(), actualRfsDate: actualRfs },
        engineMilestones,
        TODAY.toDate(),
      );

      await prisma.sOW.update({
        where: { id: sow.id },
        data: {
          progressPct: progress.toFixed(2) as never,
          gapDays: gap,
          warningLevel: warning as OverallStatus,
          warningReason: warning === 'ON_TRACK' ? null : `Auto-flagged at seed (${warning})`,
          lastComputedAt: TODAY.toDate(),
        },
      });
      await prisma.site.update({
        where: { id: site.id },
        data: {
          progressPct: progress.toFixed(2) as never,
          gapDays: gap,
          warningLevel: warning as OverallStatus,
          lastComputedAt: TODAY.toDate(),
        },
      });

      if (sowSpec.claim) {
        const c = sowSpec.claim;
        await prisma.revenueClaim.upsert({
          where: {
            sowId_type_periodYear_periodMonth: {
              sowId: sow.id,
              type: c.type,
              periodYear: c.periodYear ?? 0,
              periodMonth: c.periodMonth ?? 0,
            },
          } as never,
          update: { status: c.status, amount: c.amount.toString() as never },
          create: {
            sowId: sow.id,
            type: c.type,
            status: c.status,
            amount: c.amount.toString() as never,
            currency: 'IDR',
            periodMonth: c.periodMonth ?? null,
            periodYear: c.periodYear ?? null,
            rfsDate: actualRfs,
            submittedDate: c.status !== 'PENDING' ? TODAY.subtract(7, 'day').toDate() : null,
            paidDate: c.status === 'PAID' ? TODAY.subtract(2, 'day').toDate() : null,
          },
        });
      }
    }

    // CAPEX budget for this order's program (one entry per order; idempotent best-effort)
    const cb = await prisma.capexBudget.create({
      data: {
        programId: programs[o.customer]!.id,
        category: CapexCategory.MATERIAL,
        budget: o.capex.toString() as never,
        fiscalYear: 2026,
        notes: `CAPEX budget for ${o.number}`,
      },
    }).catch(() => null);
    if (cb) {
      await prisma.capexEntry.create({
        data: {
          capexBudgetId: cb.id,
          category: CapexCategory.MATERIAL,
          amount: Math.round(o.capex * 0.65).toString() as never,
          postedDate: TODAY.subtract(10, 'day').toDate(),
          reference: `INV-${o.number}-001`,
          notes: 'Demo realised CAPEX (~65%)',
          createdById: admin.id,
        },
      }).catch(() => undefined);
    }

    await prisma.notification.create({
      data: {
        userId: pm.id,
        kind: 'WARNING_RAISED',
        channel: 'IN_APP',
        title: `Order ${o.number} status updated`,
        body: `Latest milestone activity logged for ${o.number}.`,
        link: `/orders/${order.id}`,
      },
    }).catch(() => undefined);
  }

  console.log('[seed] done.');
  console.log(`  customers: ${Object.keys(customers).length}`);
  console.log(`  vendors:   ${Object.keys(vendors).length}`);
  console.log(`  orders:    ${ORDERS.length}`);
  console.log(`  sows:      ${totalSows}`);
  console.log(`  sites:     ${totalSites}`);
  console.log('  ----');
  console.log(`  Admin login:   ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD}`);
  console.log(`  Demo users password: ${DEFAULT_PASSWORD}`);
  console.log('  Demo users: bod@, dh.ent@, dh.pres@, pm1@, pm2@, field1@, field2@, finance@deliveriq.local');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
