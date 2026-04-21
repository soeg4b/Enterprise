// Declarative mapping: Excel sheet/columns → Prisma entity fields.
// Consumed by `src/backend/src/workers/import.worker.ts`.
// Header matching is case-insensitive with whitespace trimmed.
// Per Data agent §8.2.

export type FieldType = 'string' | 'upperString' | 'date' | 'decimal' | 'int' | 'enum' | 'lookup';

export interface FieldMapping {
  source: string | string[];   // header(s) — first match wins
  target: string;              // entity field name
  type: FieldType;
  required?: boolean;
  enumValues?: string[];
  enumDefault?: string;
  lookup?: 'user.email' | 'user.fullName' | 'department.code' | 'vendor.name' | 'customer.name';
  default?: unknown;
}

export interface SheetMapping {
  sheet: string;
  entity: 'Order' | 'SO' | 'SOW' | 'Site' | 'Milestone' | 'Vendor' | 'Customer' | 'VendorAssignment';
  naturalKey: string[];        // entity fields making the natural key
  fields: FieldMapping[];
}

export const EXCEL_MAPPINGS: SheetMapping[] = [
  {
    sheet: 'Order',
    entity: 'Order',
    naturalKey: ['orderNumber'],
    fields: [
      { source: ['order_no', 'no_order', 'order_number'], target: 'orderNumber', type: 'upperString', required: true },
      { source: ['customer_name', 'customer'], target: 'customerName', type: 'string', required: true, lookup: 'customer.name' },
      { source: 'program', target: 'programName', type: 'string' },
      { source: ['dept', 'department'], target: 'departmentCode', type: 'upperString', required: true, lookup: 'department.code' },
      {
        source: 'order_type',
        target: 'type',
        type: 'enum',
        enumValues: ['NEW', 'UPGRADE', 'RENEWAL', 'RELOCATION', 'TERMINATION'],
        enumDefault: 'NEW',
      },
      {
        source: ['product', 'product_category'],
        target: 'productCategory',
        type: 'enum',
        enumValues: ['CONNECTIVITY', 'DATACENTER', 'CLOUD', 'MANAGED_SERVICE', 'ICT_SOLUTION', 'OTHER'],
        enumDefault: 'OTHER',
      },
      { source: 'contract_value', target: 'contractValue', type: 'decimal', required: true },
      { source: 'otc', target: 'otcAmount', type: 'decimal', default: 0 },
      { source: 'mrc', target: 'mrcAmount', type: 'decimal', default: 0 },
      { source: 'capex_budget', target: 'capexBudget', type: 'decimal', default: 0 },
      { source: ['pic', 'pm'], target: 'ownerEmail', type: 'string', lookup: 'user.email' },
      { source: 'start_date', target: 'startDate', type: 'date' },
      { source: 'end_date', target: 'endDate', type: 'date' },
    ],
  },
  {
    sheet: 'SO_SOW',
    entity: 'SOW',
    naturalKey: ['sowNumber'],
    fields: [
      { source: 'so_no', target: 'soNumber', type: 'upperString', required: true },
      { source: 'sow_no', target: 'sowNumber', type: 'upperString', required: true },
      { source: 'plan_rfs', target: 'planRfsDate', type: 'date', required: true },
      { source: 'actual_rfs', target: 'actualRfsDate', type: 'date' },
      { source: 'vendor', target: 'vendorName', type: 'string', lookup: 'vendor.name' },
      { source: 'spk_no', target: 'spkNumber', type: 'string' },
      { source: 'spk_date', target: 'spkDate', type: 'date' },
      { source: 'po_no', target: 'poNumber', type: 'string' },
      { source: 'po_date', target: 'poDate', type: 'date' },
    ],
  },
  {
    sheet: 'Sites',
    entity: 'Site',
    naturalKey: ['code'],
    fields: [
      { source: 'site_code', target: 'code', type: 'upperString', required: true },
      { source: 'site_name', target: 'name', type: 'string', required: true },
      { source: 'site_type', target: 'type', type: 'enum', enumValues: ['NE', 'FE', 'POP'], enumDefault: 'NE' },
      { source: 'address', target: 'address', type: 'string' },
      { source: 'city', target: 'city', type: 'string' },
      { source: 'province', target: 'province', type: 'string' },
      { source: 'lat', target: 'latitude', type: 'decimal' },
      { source: 'long', target: 'longitude', type: 'decimal' },
      { source: 'assigned_field_user', target: 'assignedFieldUserEmail', type: 'string', lookup: 'user.email' },
      { source: 'sow_no', target: 'sowNumber', type: 'upperString', required: true },
    ],
  },
  {
    sheet: 'Vendor',
    entity: 'Vendor',
    naturalKey: ['name'],
    fields: [
      { source: ['vendor_name', 'name'], target: 'name', type: 'string', required: true },
      { source: 'pic_name', target: 'picName', type: 'string' },
      { source: 'pic_email', target: 'picEmail', type: 'string' },
      { source: 'pic_phone', target: 'picPhone', type: 'string' },
    ],
  },
];

export function normalizeHeader(h: string): string {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^\w]/g, '');
}

export function findMappingForSheet(sheetName: string): SheetMapping | undefined {
  const norm = normalizeHeader(sheetName);
  return EXCEL_MAPPINGS.find(
    (m) => normalizeHeader(m.sheet) === norm || normalizeHeader(m.sheet).includes(norm),
  );
}
