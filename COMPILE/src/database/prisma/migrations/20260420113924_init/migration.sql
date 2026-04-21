-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AD', 'BOD', 'DH', 'PM', 'FE', 'FN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('NEW', 'UPGRADE', 'RENEWAL', 'RELOCATION', 'TERMINATION');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('CONNECTIVITY', 'DATACENTER', 'CLOUD', 'MANAGED_SERVICE', 'ICT_SOLUTION', 'OTHER');

-- CreateEnum
CREATE TYPE "SiteType" AS ENUM ('NE', 'FE', 'POP');

-- CreateEnum
CREATE TYPE "SiteOwner" AS ENUM ('CUSTOMER', 'TELCO', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('STIP_2_4', 'STIP_10', 'DESIGN', 'PROCUREMENT', 'KOM', 'MATERIAL_READY', 'MOS', 'INSTALLATION', 'RFS', 'HANDOVER');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OverallStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'DELAY');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('OTC', 'MRC');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'SUBMITTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'PARSING', 'VALIDATED', 'COMMITTING', 'COMMITTED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'COMMITTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('MILESTONE_OVERDUE', 'WARNING_RAISED', 'RFS_ACHIEVED', 'CLAIM_STATUS_CHANGED', 'MENTION', 'IMPORT_DONE', 'GENERIC');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'RBAC_DENIED', 'IMPORT_COMMIT', 'IMPORT_ROLLBACK', 'EXPORT');

-- CreateEnum
CREATE TYPE "SyncOp" AS ENUM ('UPSERT', 'DELETE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED_STALE', 'REJECTED_INVALID');

-- CreateEnum
CREATE TYPE "CapexCategory" AS ENUM ('MATERIAL', 'INSTALLATION', 'TRANSPORT', 'OTHER');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "email" CITEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'id-ID',
    "departmentId" UUID,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "npwp" TEXT,
    "picName" TEXT,
    "picEmail" TEXT,
    "picPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" UUID,
    "departmentId" UUID,
    "capexBudget" DECIMAL(18,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "picName" TEXT,
    "picEmail" TEXT,
    "picPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "orderNumber" TEXT NOT NULL,
    "programId" UUID,
    "customerId" UUID NOT NULL,
    "departmentId" UUID,
    "ownerUserId" UUID,
    "type" "OrderType" NOT NULL,
    "productCategory" "ProductCategory" NOT NULL,
    "description" TEXT,
    "contractValue" DECIMAL(18,2) NOT NULL,
    "otcAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "mrcAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "capexBudget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDocument" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SO" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "orderId" UUID NOT NULL,
    "soNumber" TEXT NOT NULL,
    "scope" TEXT,
    "ownerUserId" UUID,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "capexBudget" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SO_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SOW" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "soId" UUID NOT NULL,
    "sowNumber" TEXT NOT NULL,
    "scope" TEXT,
    "ownerUserId" UUID,
    "planRfsDate" TIMESTAMP(3) NOT NULL,
    "actualRfsDate" TIMESTAMP(3),
    "progressPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gapDays" INTEGER NOT NULL DEFAULT 0,
    "warningLevel" "OverallStatus" NOT NULL DEFAULT 'ON_TRACK',
    "warningReason" TEXT,
    "lastComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SOW_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "sowId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SiteType" NOT NULL,
    "owner" "SiteOwner" NOT NULL DEFAULT 'CUSTOMER',
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "customerLocId" TEXT,
    "assignedFieldUserId" UUID,
    "progressPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gapDays" INTEGER NOT NULL DEFAULT 0,
    "warningLevel" "OverallStatus" NOT NULL DEFAULT 'ON_TRACK',
    "lastComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "sowId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "neSiteId" UUID NOT NULL,
    "feSiteId" UUID NOT NULL,
    "bandwidth" TEXT,
    "distanceKm" DECIMAL(9,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAssignment" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "sowId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "spkNumber" TEXT,
    "spkDate" TIMESTAMP(3),
    "poNumber" TEXT,
    "poDate" TIMESTAMP(3),
    "amount" DECIMAL(18,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VendorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "sowId" UUID NOT NULL,
    "siteId" UUID,
    "type" "MilestoneType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "planDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "remark" TEXT,
    "blockedReason" TEXT,
    "overdueDays" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneEvent" (
    "id" UUID NOT NULL,
    "milestoneId" UUID NOT NULL,
    "fromStatus" "MilestoneStatus",
    "toStatus" "MilestoneStatus" NOT NULL,
    "actualDate" TIMESTAMP(3),
    "remark" TEXT,
    "actorUserId" UUID,
    "approvedById" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'web',
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilestoneEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldUpdate" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "siteId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "notes" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "accuracyM" DECIMAL(7,2),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "siteId" UUID,
    "milestoneId" UUID,
    "fieldUpdateId" UUID,
    "s3Key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "takenAt" TIMESTAMP(3),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueClaim" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "sowId" UUID NOT NULL,
    "type" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "periodMonth" INTEGER,
    "periodYear" INTEGER,
    "invoiceNumber" TEXT,
    "rfsDate" TIMESTAMP(3),
    "submittedDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RevenueClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapexBudget" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "programId" UUID,
    "soId" UUID,
    "category" "CapexCategory" NOT NULL,
    "budget" DECIMAL(18,2) NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CapexBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapexEntry" (
    "id" UUID NOT NULL,
    "capexBudgetId" UUID NOT NULL,
    "category" "CapexCategory" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "postedDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CapexEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "userId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "traceId" TEXT,
    "prevHash" TEXT,
    "hash" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "committedRows" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "uploadedById" UUID NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" BIGSERIAL NOT NULL,
    "importJobId" UUID NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "naturalKey" TEXT,
    "rawData" JSONB NOT NULL,
    "normalized" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "errors" JSONB,
    "committedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncOutbox" (
    "id" BIGSERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "op" "SyncOp" NOT NULL,
    "payload" JSONB NOT NULL,
    "clientUpdatedAt" TIMESTAMP(3) NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "serverState" JSONB,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SyncOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" BIGSERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE INDEX "User_tenantId_role_status_idx" ON "User"("tenantId", "role", "status");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_tenant_email_uq" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "dept_tenant_code_uq" ON "Department"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_tenant_code_uq" ON "Customer"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Program_customerId_idx" ON "Program"("customerId");

-- CreateIndex
CREATE INDEX "Program_departmentId_idx" ON "Program"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "program_tenant_code_uq" ON "Program"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_isActive_idx" ON "Vendor"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_tenant_code_uq" ON "Vendor"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Order_tenantId_customerId_idx" ON "Order"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Order_tenantId_departmentId_idx" ON "Order"("tenantId", "departmentId");

-- CreateIndex
CREATE INDEX "Order_ownerUserId_idx" ON "Order"("ownerUserId");

-- CreateIndex
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_tenant_number_uq" ON "Order"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "OrderDocument_orderId_idx" ON "OrderDocument"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderDocument_orderId_sha256_key" ON "OrderDocument"("orderId", "sha256");

-- CreateIndex
CREATE INDEX "SO_orderId_idx" ON "SO"("orderId");

-- CreateIndex
CREATE INDEX "SO_ownerUserId_idx" ON "SO"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "so_tenant_number_uq" ON "SO"("tenantId", "soNumber");

-- CreateIndex
CREATE INDEX "SOW_soId_idx" ON "SOW"("soId");

-- CreateIndex
CREATE INDEX "SOW_planRfsDate_idx" ON "SOW"("planRfsDate");

-- CreateIndex
CREATE INDEX "SOW_warningLevel_planRfsDate_idx" ON "SOW"("warningLevel", "planRfsDate");

-- CreateIndex
CREATE INDEX "SOW_ownerUserId_warningLevel_idx" ON "SOW"("ownerUserId", "warningLevel");

-- CreateIndex
CREATE INDEX "SOW_deletedAt_idx" ON "SOW"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sow_tenant_number_uq" ON "SOW"("tenantId", "sowNumber");

-- CreateIndex
CREATE INDEX "Site_sowId_idx" ON "Site"("sowId");

-- CreateIndex
CREATE INDEX "Site_assignedFieldUserId_updatedAt_idx" ON "Site"("assignedFieldUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "Site_warningLevel_idx" ON "Site"("warningLevel");

-- CreateIndex
CREATE INDEX "Site_type_idx" ON "Site"("type");

-- CreateIndex
CREATE UNIQUE INDEX "site_tenant_code_uq" ON "Site"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Segment_sowId_idx" ON "Segment"("sowId");

-- CreateIndex
CREATE INDEX "Segment_neSiteId_idx" ON "Segment"("neSiteId");

-- CreateIndex
CREATE INDEX "Segment_feSiteId_idx" ON "Segment"("feSiteId");

-- CreateIndex
CREATE UNIQUE INDEX "segment_tenant_code_uq" ON "Segment"("tenantId", "code");

-- CreateIndex
CREATE INDEX "VendorAssignment_vendorId_idx" ON "VendorAssignment"("vendorId");

-- CreateIndex
CREATE INDEX "VendorAssignment_sowId_idx" ON "VendorAssignment"("sowId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_assign_sow_vendor_spk_uq" ON "VendorAssignment"("sowId", "vendorId", "spkNumber");

-- CreateIndex
CREATE INDEX "Milestone_sowId_sequence_idx" ON "Milestone"("sowId", "sequence");

-- CreateIndex
CREATE INDEX "Milestone_siteId_type_idx" ON "Milestone"("siteId", "type");

-- CreateIndex
CREATE INDEX "Milestone_status_planDate_idx" ON "Milestone"("status", "planDate");

-- CreateIndex
CREATE INDEX "Milestone_planDate_idx" ON "Milestone"("planDate");

-- CreateIndex
CREATE INDEX "Milestone_updatedAt_idx" ON "Milestone"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_sow_site_type_uq" ON "Milestone"("sowId", "siteId", "type");

-- CreateIndex
CREATE INDEX "MilestoneEvent_milestoneId_occurredAt_idx" ON "MilestoneEvent"("milestoneId", "occurredAt");

-- CreateIndex
CREATE INDEX "MilestoneEvent_actorUserId_occurredAt_idx" ON "MilestoneEvent"("actorUserId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneEvent_clientId_key" ON "MilestoneEvent"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldUpdate_clientId_key" ON "FieldUpdate"("clientId");

-- CreateIndex
CREATE INDEX "FieldUpdate_siteId_occurredAt_idx" ON "FieldUpdate"("siteId", "occurredAt");

-- CreateIndex
CREATE INDEX "FieldUpdate_userId_occurredAt_idx" ON "FieldUpdate"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "Photo_siteId_idx" ON "Photo"("siteId");

-- CreateIndex
CREATE INDEX "Photo_milestoneId_idx" ON "Photo"("milestoneId");

-- CreateIndex
CREATE INDEX "Photo_fieldUpdateId_idx" ON "Photo"("fieldUpdateId");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_sha256_key" ON "Photo"("sha256");

-- CreateIndex
CREATE INDEX "RevenueClaim_status_createdAt_idx" ON "RevenueClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RevenueClaim_tenantId_status_idx" ON "RevenueClaim"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "claim_sow_type_period_uq" ON "RevenueClaim"("sowId", "type", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "CapexBudget_programId_fiscalYear_idx" ON "CapexBudget"("programId", "fiscalYear");

-- CreateIndex
CREATE INDEX "CapexBudget_soId_fiscalYear_idx" ON "CapexBudget"("soId", "fiscalYear");

-- CreateIndex
CREATE INDEX "CapexEntry_capexBudgetId_postedDate_idx" ON "CapexEntry"("capexBudgetId", "postedDate");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_kind_createdAt_idx" ON "Notification"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_occurredAt_idx" ON "AuditLog"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_occurredAt_idx" ON "AuditLog"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_occurredAt_idx" ON "AuditLog"("occurredAt");

-- CreateIndex
CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_sha256_key" ON "ImportJob"("sha256");

-- CreateIndex
CREATE INDEX "ImportRow_importJobId_sheetName_idx" ON "ImportRow"("importJobId", "sheetName");

-- CreateIndex
CREATE INDEX "ImportRow_importJobId_status_idx" ON "ImportRow"("importJobId", "status");

-- CreateIndex
CREATE INDEX "ImportRow_entityType_naturalKey_idx" ON "ImportRow"("entityType", "naturalKey");

-- CreateIndex
CREATE UNIQUE INDEX "SyncOutbox_clientId_key" ON "SyncOutbox"("clientId");

-- CreateIndex
CREATE INDEX "SyncOutbox_userId_receivedAt_idx" ON "SyncOutbox"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "SyncOutbox_entityType_entityId_idx" ON "SyncOutbox"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCursor_userId_scope_key" ON "SyncCursor"("userId", "scope");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SO" ADD CONSTRAINT "SO_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SO" ADD CONSTRAINT "SO_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOW" ADD CONSTRAINT "SOW_soId_fkey" FOREIGN KEY ("soId") REFERENCES "SO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOW" ADD CONSTRAINT "SOW_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_sowId_fkey" FOREIGN KEY ("sowId") REFERENCES "SOW"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_assignedFieldUserId_fkey" FOREIGN KEY ("assignedFieldUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_sowId_fkey" FOREIGN KEY ("sowId") REFERENCES "SOW"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_neSiteId_fkey" FOREIGN KEY ("neSiteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_feSiteId_fkey" FOREIGN KEY ("feSiteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssignment" ADD CONSTRAINT "VendorAssignment_sowId_fkey" FOREIGN KEY ("sowId") REFERENCES "SOW"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssignment" ADD CONSTRAINT "VendorAssignment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_sowId_fkey" FOREIGN KEY ("sowId") REFERENCES "SOW"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneEvent" ADD CONSTRAINT "MilestoneEvent_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneEvent" ADD CONSTRAINT "MilestoneEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneEvent" ADD CONSTRAINT "MilestoneEvent_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldUpdate" ADD CONSTRAINT "FieldUpdate_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldUpdate" ADD CONSTRAINT "FieldUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_fieldUpdateId_fkey" FOREIGN KEY ("fieldUpdateId") REFERENCES "FieldUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueClaim" ADD CONSTRAINT "RevenueClaim_sowId_fkey" FOREIGN KEY ("sowId") REFERENCES "SOW"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapexBudget" ADD CONSTRAINT "CapexBudget_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapexBudget" ADD CONSTRAINT "CapexBudget_soId_fkey" FOREIGN KEY ("soId") REFERENCES "SO"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapexEntry" ADD CONSTRAINT "CapexEntry_capexBudgetId_fkey" FOREIGN KEY ("capexBudgetId") REFERENCES "CapexBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOutbox" ADD CONSTRAINT "SyncOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
