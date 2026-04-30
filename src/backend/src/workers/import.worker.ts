// Excel import worker — uses exceljs to parse multi-sheet workbook with the
// declarative column→entity mapping from src/database/import/excel-mapping.ts.
// Idempotent by natural keys (orderNumber, soNumber, sowNumber, site code).

import { Worker } from 'bullmq';
import ExcelJS from 'exceljs';
import { getRedis } from '../db/redis.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { QUEUE_NAMES, type ImportParseJob } from '../queues/queues.js';
import { audit } from '../audit/audit.js';
import { EXCEL_MAPPINGS, normalizeHeader, type SheetMapping, type FieldMapping } from 'deliveriq-database/import/excel-mapping.js';

interface NormRow {
  rowNumber: number;
  values: Record<string, unknown>;
  errors: Array<{ path: string; msg: string }>;
}

function parseValue(field: FieldMapping, raw: unknown): { ok: true; value: unknown } | { ok: false; msg: string } {
  if (raw === null || raw === undefined || raw === '') {
    if (field.required && field.default === undefined) return { ok: false, msg: `${field.target} required` };
    return { ok: true, value: field.default ?? null };
  }
  switch (field.type) {
    case 'string':
      return { ok: true, value: String(raw).trim() };
    case 'upperString':
      return { ok: true, value: String(raw).trim().toUpperCase() };
    case 'int': {
      const n = Number(raw);
      return Number.isFinite(n) ? { ok: true, value: Math.trunc(n) } : { ok: false, msg: `${field.target} not int` };
    }
    case 'decimal': {
      const cleaned = String(raw).replace(/[Rr]p|\s|,/g, '');
      const n = Number(cleaned);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, msg: `${field.target} not numeric` };
    }
    case 'date': {
      const d = raw instanceof Date ? raw : new Date(String(raw));
      return Number.isFinite(d.getTime()) ? { ok: true, value: d } : { ok: false, msg: `${field.target} not date` };
    }
    case 'enum': {
      const v = String(raw).trim().toUpperCase();
      if (field.enumValues?.includes(v)) return { ok: true, value: v };
      if (field.enumDefault) return { ok: true, value: field.enumDefault };
      return { ok: false, msg: `${field.target} unknown enum value '${v}'` };
    }
    case 'lookup':
      return { ok: true, value: String(raw).trim() };
    default:
      return { ok: true, value: raw };
  }
}

async function parseSheet(ws: ExcelJS.Worksheet, mapping: SheetMapping, importJobId: string): Promise<NormRow[]> {
  // Header row
  const header: Record<string, number> = {};
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell, col) => {
    const k = normalizeHeader(String(cell.value ?? ''));
    if (k) header[k] = col;
  });

  const out: NormRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    const result: NormRow = { rowNumber: r, values: {}, errors: [] };

    for (const f of mapping.fields) {
      const sourceCandidates = Array.isArray(f.source) ? f.source : [f.source];
      let raw: unknown = null;
      for (const candidate of sourceCandidates) {
        const idx = header[normalizeHeader(candidate)];
        if (idx !== undefined) {
          const cell = row.getCell(idx);
          raw = cell.value as unknown;
          if (raw !== null && raw !== undefined && raw !== '') break;
        }
      }
      const parsed = parseValue(f, raw);
      if (parsed.ok) {
        result.values[f.target] = parsed.value;
      } else {
        result.errors.push({ path: f.target, msg: parsed.msg });
      }
    }

    // persist staging row
    const naturalKey = mapping.naturalKey.map((k) => result.values[k]).filter(Boolean).join('|') || null;
    await prisma.importRow.create({
      data: {
        importJobId,
        sheetName: mapping.sheet,
        rowNumber: r,
        entityType: mapping.entity,
        naturalKey,
        rawData: { ...result.values } as never,
        normalized: { ...result.values } as never,
        status: result.errors.length ? 'INVALID' : 'VALID',
        errors: result.errors as never,
      },
    });

    out.push(result);
  }
  return out;
}

export function startImportWorker(): Worker {
  const worker = new Worker<ImportParseJob>(
    QUEUE_NAMES.importParse,
    async (job) => {
      const { importJobId, uploadedById } = job.data;
      const ij = await prisma.importJob.findFirst({ where: { id: importJobId } });
      if (!ij) return;

      await prisma.importJob.update({ where: { id: importJobId }, data: { status: 'PARSING', startedAt: new Date() } });

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(ij.s3Key);

      let totalRows = 0;
      let invalidRows = 0;
      let validRows = 0;

      for (const ws of wb.worksheets) {
        const mapping = EXCEL_MAPPINGS.find(
          (m) => normalizeHeader(m.sheet) === normalizeHeader(ws.name),
        );
        if (!mapping) {
          logger.warn({ sheet: ws.name }, 'import.unknown.sheet');
          continue;
        }
        const rows = await parseSheet(ws, mapping, importJobId);
        totalRows += rows.length;
        for (const r of rows) {
          if (r.errors.length) invalidRows++;
          else validRows++;
        }
      }

      await prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: invalidRows === 0 ? 'VALIDATED' : 'VALIDATED',
          totalRows, validRows, invalidRows, finishedAt: new Date(),
          report: { totalRows, validRows, invalidRows } as never,
        },
      });
      await audit({
        actorUserId: uploadedById, action: 'IMPORT_COMMIT', entityType: 'ImportJob', entityId: importJobId,
        after: { totalRows, validRows, invalidRows },
      });
      logger.info({ importJobId, totalRows, validRows, invalidRows }, 'import.parsed');
    },
    { connection: getRedis() as never, concurrency: 1 },
  );

  worker.on('failed', async (job, err) => {
    logger.error({ err, jobId: job?.id }, 'import.worker.failed');
    if (job?.data.importJobId) {
      await prisma.importJob.update({
        where: { id: job.data.importJobId },
        data: { status: 'FAILED', report: { error: err.message } as never, finishedAt: new Date() },
      }).catch(() => undefined);
    }
  });

  return worker;
}
