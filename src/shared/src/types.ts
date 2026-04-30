// Shared TS types — mirror Prisma schema (DB-only fields omitted/optional).
// These are the canonical wire-format types used by API + web + mobile.

export type UserRole = 'AD' | 'BOD' | 'DH' | 'PM' | 'FE' | 'FN';
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';

export type OrderType = 'NEW' | 'UPGRADE' | 'RENEWAL' | 'RELOCATION' | 'TERMINATION';
export type ProductCategory =
  | 'CONNECTIVITY'
  | 'DATACENTER'
  | 'CLOUD'
  | 'MANAGED_SERVICE'
  | 'ICT_SOLUTION'
  | 'OTHER';

export type SiteType = 'NE' | 'FE' | 'POP';
export type SiteOwner = 'CUSTOMER' | 'TELCO' | 'THIRD_PARTY';

export type MilestoneType =
  | 'STIP_2_4'
  | 'STIP_10'
  | 'DESIGN'
  | 'PROCUREMENT'
  | 'KOM'
  | 'MATERIAL_READY'
  | 'MOS'
  | 'INSTALLATION'
  | 'RFS'
  | 'HANDOVER';

export type MilestoneStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';

export type OverallStatus = 'ON_TRACK' | 'AT_RISK' | 'DELAY' | 'UNKNOWN';

export type ClaimType = 'OTC' | 'MRC';
export type ClaimStatus = 'PENDING' | 'SUBMITTED' | 'PAID' | 'CANCELLED';

export type ImportStatus =
  | 'UPLOADED'
  | 'PARSING'
  | 'VALIDATED'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'FAILED'
  | 'ROLLED_BACK';

export type SyncOp = 'UPSERT' | 'DELETE';
export type SyncItemStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED_STALE' | 'REJECTED_INVALID';

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  departmentId: string | null;
  locale: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName?: string;
  departmentId: string | null;
  ownerUserId: string | null;
  type: OrderType;
  productCategory: ProductCategory;
  contractValue: string; // Decimal as string for precision
  otcAmount: string;
  mrcAmount: string;
  capexBudget: string;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SoDto {
  id: string;
  soNumber: string;
  orderId: string;
  ownerUserId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface SowDto {
  id: string;
  sowNumber: string;
  soId: string;
  ownerUserId: string | null;
  planRfsDate: string;
  actualRfsDate: string | null;
  progressPct: string;
  gapDays: number;
  warningLevel: OverallStatus;
  warningReason: string | null;
  lastComputedAt: string | null;
}

export interface SiteDto {
  id: string;
  sowId: string;
  code: string;
  name: string;
  type: SiteType;
  owner: SiteOwner;
  address: string | null;
  city: string | null;
  province: string | null;
  latitude: string | null;
  longitude: string | null;
  assignedFieldUserId: string | null;
  progressPct: string;
  gapDays: number;
  warningLevel: OverallStatus;
  updatedAt: string;
}

export interface MilestoneDto {
  id: string;
  sowId: string;
  siteId: string | null;
  type: MilestoneType;
  sequence: number;
  weight: number;
  status: MilestoneStatus;
  planDate: string | null;
  actualDate: string | null;
  remark: string | null;
  blockedReason: string | null;
  overdueDays: number;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface BodReportDto {
  totalRevenue: string;
  revenueAtRisk: string;
  onTrackPercent: number;
  capexConsumedPercent: number;
  rfsMonthPlan: number;
  rfsMonthActual: number;
  overdueCount: number;
  statusDistribution: { onTrack: number; atRisk: number; delay: number };
  departments: Array<{
    departmentId: string;
    departmentCode: string;
    departmentName: string;
    onTrack: number;
    atRisk: number;
    delay: number;
  }>;
  generatedAt: string;
  cacheStatus: 'HIT' | 'MISS' | 'STALE';
}

export interface DepartmentReportDto {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  funnel: Array<{ stage: MilestoneType; count: number; overdue: number; avgDaysInStage: number }>;
  generatedAt: string;
}

export interface SyncPullResponse {
  serverTimeUtc: string;
  nextToken: string;
  entities: {
    sites: SiteDto[];
    milestones: MilestoneDto[];
  };
  tombstones: Array<{ entity: string; id: string }>;
}

export interface SyncPushItem {
  clientId: string;
  entity: string;
  entityId?: string;
  op: SyncOp;
  payload: Record<string, unknown>;
  clientUpdatedAt: string;
}

export interface SyncPushResponseItem {
  clientId: string;
  status: SyncItemStatus;
  serverState?: unknown;
  errorCode?: string;
  errorDetail?: string;
}

export interface SyncPushResponse {
  items: SyncPushResponseItem[];
}

export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  occurredAt: string;
}

// =============================================================================
// Executive Summary + Partner Delivery (Excel-mapped reports)
// =============================================================================

export interface ExecutiveSummaryFilters {
  years: number[];
  departments: Array<{ id: string; code: string; name: string }>;
  products: ProductCategory[];
  customers: Array<{ id: string; code: string; name: string }>;
}

export interface ProvinceProjectRow {
  province: string;
  country: string;
  totalProjects: number;
}

export interface PoMonitoringRow {
  productCategory: ProductCategory;
  totalReleased: number;
  totalDelivered: number;
}

export interface ExecutiveSummaryDto {
  filters: ExecutiveSummaryFilters;
  projectsByProvince: ProvinceProjectRow[];
  poMonitoring: {
    rows: PoMonitoringRow[];
    grandTotalReleased: number;
    grandTotalDelivered: number;
    totalPoValue: string;       // Rp
    totalDeliveredValue: string;// Rp
  };
  implementation: {
    complete: number;
    inProgress: number;
    overallPercent: number;
    buckets: { lt10: number; p10_50: number; p50_90: number; p100: number };
  };
  capexRealization: {
    overBudget: number;
    underBudget: number;
    overallPercent: number;
    buckets: { lt10: number; p10_50: number; p50_90: number; p100: number; gt100: number };
  };
  generatedAt: string;
  cacheStatus: 'HIT' | 'MISS' | 'STALE';
}

export type CapexHealth = 'OK' | 'OVER';

export interface PartnerDeliveryRowDto {
  orderId: string;
  orderNumber: string;
  projectName: string;          // e.g. "Broadband Internet - PT Mandiri"
  productCategory: ProductCategory;
  customerName: string;
  siteNames: string[];
  vendorNames: string[];
  implementationPct: number;    // 0..100
  capexRealizationPct: number;  // 0..whatever
  capexHealth: CapexHealth;
  warningLevel: OverallStatus;
  criticalIssue: string;        // human readable summary or '-'
}

export interface PartnerDeliveryReportDto {
  rows: PartnerDeliveryRowDto[];
  generatedAt: string;
  cacheStatus: 'HIT' | 'MISS' | 'STALE';
}
