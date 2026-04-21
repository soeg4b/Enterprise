# Excel Import

The Excel importer migrates the legacy "Draft Dashboard.xlsx" into the database.

- Endpoint: `POST /v1/imports/excel` (AD only). See [api.md](api.md#imports-excel).
- Mapping: declarative, [src/database/import/excel-mapping.ts](../src/database/import/excel-mapping.ts).
- Worker: streaming parser via ExcelJS, [src/backend/src/workers/import.worker.ts](../src/backend/src/workers/import.worker.ts).
- Limits: `.xlsx` only, max 25 MB. Identical SHA-256 -> `409 duplicate`.
- Status flow: `UPLOADED` -> `PARSING` -> `VALIDATED` (rows staged in `ImportRow`) -> *commit* (Phase 2) -> `COMMITTED`.

## 1. Pipeline

```
[client] --multipart--> POST /v1/imports/excel
                       |  size + extension + sha256 check
                       v
                  ImportJob (UPLOADED)
                       |
                       v
                  BullMQ "import:parse"
                       |
                       v
                import.worker streams sheets
                  per row -> ImportRow{importJobId, sheetName, naturalKey, payload, status}
                       |
                       v
                  ImportJob (VALIDATED)   <-- review in /imports UI
                       |
                       v
              [Phase 2] POST /v1/imports/:id/commit
                  upsert by naturalKey -> Order/SO/SOW/Site/Vendor
                  spawn milestones from template
                  ImportJob (COMMITTED)
```

## 2. Sheet -> entity mapping

| Sheet (case-insensitive) | Entity | Natural key |
|---|---|---|
| `Order` | Order | `orderNumber` |
| `SO_SOW` | SOW (and SO via `soNumber`) | `sowNumber` |
| `Sites` | Site | `code` |
| `Vendor` | Vendor | `name` |

Header matching is case-insensitive with whitespace and punctuation normalised (`normalizeHeader`).

## 3. Column mapping (selected)

### Order
| Header alternates | Field | Type |
|---|---|---|
| `order_no`, `no_order`, `order_number` | `orderNumber` | upperString (req) |
| `customer_name`, `customer` | `customerName` -> Customer lookup | string (req) |
| `program` | `programName` | string |
| `dept`, `department` | `departmentCode` -> Department lookup | upperString (req) |
| `order_type` | `type` enum (`NEW` default) | enum |
| `product`, `product_category` | `productCategory` enum (`OTHER` default) | enum |
| `contract_value` | `contractValue` | decimal (req) |
| `otc`, `mrc`, `capex_budget` | money fields | decimal (default 0) |
| `pic`, `pm` | `ownerEmail` -> User lookup | string |
| `start_date`, `end_date` | dates | date |

### SO_SOW
| Header | Field |
|---|---|
| `so_no` | `soNumber` (req) |
| `sow_no` | `sowNumber` (req) |
| `plan_rfs` | `planRfsDate` (req) |
| `actual_rfs` | `actualRfsDate` |
| `vendor` -> Vendor lookup | `vendorName` |
| `spk_no`, `spk_date`, `po_no`, `po_date` | vendor execution fields |

### Sites
| Header | Field |
|---|---|
| `site_code` | `code` (req) |
| `site_name` | `name` (req) |
| `site_type` | `type` enum (`NE` default) |
| `address`, `city`, `province` | location |
| `lat`, `long` | `latitude`, `longitude` |
| `assigned_field_user` | `assignedFieldUserEmail` -> User lookup |
| `sow_no` | parent SOW lookup |

### Vendor
| Header | Field |
|---|---|
| `vendor_name`, `name` | `name` (req) |
| `pic_name`, `pic_email`, `pic_phone` | contact |

Full mapping in [src/database/import/excel-mapping.ts](../src/database/import/excel-mapping.ts).

## 4. Validation rules

- Required fields enforced per column flag.
- Enum values normalised against allowed list; `enumDefault` used on miss.
- Lookups (`user.email`, `vendor.name`, `customer.name`, `department.code`) resolved at commit time; unresolved lookups produce row-level errors in `ImportRow.status = 'INVALID'`.
- Dates parsed permissively (Excel serial or ISO string).
- Decimals stored as strings to preserve precision.

## 5. Curl example

```bash
curl -sX POST http://localhost:4000/v1/imports/excel \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./Draft_Dashboard.xlsx"
# -> 202  { "importJobId": "...", "status": "UPLOADED" }

curl -s http://localhost:4000/v1/imports/<jobId> \
  -H "Authorization: Bearer $TOKEN"
# -> { "status":"VALIDATED", "rowCount":..., "errorCount":... }
```

## 6. Notes / Phase 2

- `POST /v1/imports/:id/commit` (with diff preview) is **Phase 2**. MVP only stages rows.
- Storage: MVP writes the uploaded buffer to `os.tmpdir()/deliveriq-imports/<sha256>.xlsx`. Production uses S3/MinIO presigned upload (compose ships MinIO).
- Excel formula injection: importer never executes formulas (ExcelJS reads cells as data). Future export paths must prepend `'` to cells beginning with `= + - @`.
