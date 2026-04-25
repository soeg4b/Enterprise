// =============================================================================
// Fiber Optic Project tagging — demo module
// -----------------------------------------------------------------------------
// Capability: Project Admin defines NE & FE points. Mitra (vendor) tags every
// pole between them by uploading photos; the API extracts GPS from each photo's
// EXIF metadata and orders the poles into a polyline, forming the FO link.
//
// Storage: in-memory (Map) + filesystem for image binaries. Self-contained so
// it works even when Postgres is offline. Auth disabled for the demo.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { promises as fs, createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import { analyzeOtdr, type OtdrAnalysis, type OtdrTestInput } from './otdr-analyzer.js';
import { checkOtdrPhotoQuality, type PhotoQualityCheck } from './photo-quality.js';

// ---- Types ------------------------------------------------------------------

type Endpoint = { name: string; address?: string; latitude: number; longitude: number };

type Pole = {
  id: string;
  sequence: number;
  photoId: string;
  filename: string;
  latitude: number;
  longitude: number;
  capturedAt: string | null;
  uploadedAt: string;
  uploadedBy: string;
  note: string;
};

type OtdrTest = {
  id: string;
  segment: string;            // e.g. 'A-B' (NE → FE), 'A-Splice1', etc.
  core: 'TX' | 'RX';          // each link must have BOTH cores measured
  sowNumber?: string;         // optional cross-link to SOW table
  photoId: string | null;     // device screen photo (evidence)
  filename: string | null;
  deviceModel: string;
  measuredAt: string;
  operator: string;
  input: OtdrTestInput;
  analysis: OtdrAnalysis;
  photoQuality: PhotoQualityCheck | null;
  exif: Record<string, unknown> | null;
  notes: string;
  createdAt: string;
};

type FiberProject = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  description: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  vendorName: string;
  nearEnd: Endpoint;
  farEnd: Endpoint;
  createdAt: string;
  poles: Pole[];
  otdrTests: OtdrTest[];
};

// ---- Storage ----------------------------------------------------------------

const PROJECT_ROOT = path.resolve(process.cwd(), '..', '..');
const SEED_PHOTO_DIR = path.join(PROJECT_ROOT, 'Foto Project');
const UPLOAD_DIR = path.join(PROJECT_ROOT, 'Foto Project Uploads');
const OTDR_SEED_DIR = path.join(PROJECT_ROOT, 'OTDR Test');
const OTDR_UPLOAD_DIR = path.join(PROJECT_ROOT, 'OTDR Test Uploads');

const projects = new Map<string, FiberProject>();

// ---- Geo helpers ------------------------------------------------------------

function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function totalLengthMeters(points: { latitude: number; longitude: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineMeters(points[i - 1], points[i]);
  return total;
}

function orderPoles(project: FiberProject): void {
  // Sort by EXIF capture time (falls back to upload time). For a real fiber
  // route, sequence is the capture order along NE → FE traversal.
  project.poles.sort((a, b) => {
    const ta = a.capturedAt ?? a.uploadedAt;
    const tb = b.capturedAt ?? b.uploadedAt;
    return ta.localeCompare(tb);
  });
  project.poles.forEach((p, i) => {
    p.sequence = i + 1;
  });
}

// ---- EXIF extraction --------------------------------------------------------

type ExtractedGps = { latitude: number | null; longitude: number | null; capturedAt: string | null };

async function extractGps(buffer: Buffer): Promise<ExtractedGps> {
  try {
    const meta = await exifr.parse(buffer, { gps: true, exif: true });
    const lat = typeof meta?.latitude === 'number' ? meta.latitude : null;
    const lon = typeof meta?.longitude === 'number' ? meta.longitude : null;
    const captured = meta?.DateTimeOriginal instanceof Date
      ? meta.DateTimeOriginal.toISOString()
      : (typeof meta?.DateTimeOriginal === 'string' ? meta.DateTimeOriginal : null);
    return { latitude: lat, longitude: lon, capturedAt: captured };
  } catch {
    return { latitude: null, longitude: null, capturedAt: null };
  }
}

// ---- Demo seed --------------------------------------------------------------

async function seedDemoProject(): Promise<void> {
  if (projects.size > 0) return;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const project: FiberProject = {
    id: 'fp-bsd-loop-001',
    code: 'FO-BSD-2026-001',
    name: 'BSD Loop Fiber Optic Backbone',
    customerName: 'PT Telkom Akses — BSD Cluster',
    description:
      'Pembangunan jalur backbone FO sepanjang ruas BSD Loop, menghubungkan Junction Box A (Near End) ' +
      'menuju Distribution Hub BSD City (Far End). Mitra wajib melakukan tagging foto pada setiap tiang ' +
      'sepanjang rute. Koordinat diambil otomatis dari metadata EXIF.',
    status: 'IN_PROGRESS',
    vendorName: 'PT Mitra Sarana Fiber',
    nearEnd: {
      name: 'BSD Junction Box A (Near End)',
      address: 'Jl. BSD Boulevard Barat, Tangerang Selatan',
      latitude: -6.320116,
      longitude: 106.666433,
    },
    farEnd: {
      name: 'BSD Distribution Hub (Far End)',
      address: 'Jl. BSD Grand Boulevard, Tangerang Selatan',
      latitude: -6.315328,
      longitude: 106.675369,
    },
    createdAt: new Date().toISOString(),
    poles: [],
    otdrTests: [],
  };

  if (existsSync(SEED_PHOTO_DIR)) {
    const files = (await fs.readdir(SEED_PHOTO_DIR)).filter((f) => /\.(jpe?g|png)$/i.test(f));
    for (const filename of files) {
      const srcPath = path.join(SEED_PHOTO_DIR, filename);
      const buf = await fs.readFile(srcPath);
      const gps = await extractGps(buf);
      if (gps.latitude == null || gps.longitude == null) continue;

      const photoId = randomUUID();
      const ext = path.extname(filename) || '.jpg';
      const storedName = `${photoId}${ext}`;
      await fs.writeFile(path.join(UPLOAD_DIR, storedName), buf);

      project.poles.push({
        id: randomUUID(),
        sequence: 0,
        photoId,
        filename: storedName,
        latitude: gps.latitude,
        longitude: gps.longitude,
        capturedAt: gps.capturedAt,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'seed@demo',
        note: '',
      });
    }
    orderPoles(project);
  }

  // ---- Seed two OTDR sample readings (from on-device photos) ----
  await fs.mkdir(OTDR_UPLOAD_DIR, { recursive: true });
  // Sample 1 — MINI OT-8810, 1310 nm, short test pigtail (0.254 km)
  const otdr1Input: OtdrTestInput = {
    wavelengthNm: 1310,
    pulseWidthNs: 10,
    scanRangeKm: 6,
    iorIndex: 1.47,
    totalLengthKm: 0.2544,
    totalLossDb: 2.49,
    avgLossDbPerKm: 15.914, // intentionally high — short pigtail w/ end connector skews dB/km
    events: [
      { type: 'F_START',   locationKm: 0.000, lossDb: null,  attenDbPerKm: null },
      { type: 'NON_REFL',  locationKm: 0.099, lossDb: 0.908, attenDbPerKm: 3.138 },
      { type: 'NON_REFL',  locationKm: 0.146, lossDb: 0.798, attenDbPerKm: 3.584 },
      { type: 'NON_REFL',  locationKm: 0.185, lossDb: 0.453, attenDbPerKm: 1.797 },
      { type: 'NON_REFL',  locationKm: 0.205, lossDb: 0.563, attenDbPerKm: 0.000 },
      { type: 'F_END',     locationKm: 0.254, lossDb: null,  attenDbPerKm: 8.869 },
    ],
    measuredAt: '2013-09-29T14:11:32+07:00',
    operator: 'Mitra Field Tech',
  };
  // Sample 2 — Optiker OTDR, 1550 nm, 3.67 km link
  const otdr2Input: OtdrTestInput = {
    wavelengthNm: 1550,
    pulseWidthNs: 100,
    scanRangeKm: 5,
    iorIndex: 1.4675,
    totalLengthKm: 3.67038,
    totalLossDb: 8.30174,
    avgLossDbPerKm: 2.262,  // high → likely poor connector/splice
    events: [
      { type: 'F_START',    locationKm: 0.00000, lossDb: null,    attenDbPerKm: null },
      { type: 'REFLECTIVE', locationKm: 2.50976, lossDb: 6.81385, reflectanceDb: -50, attenDbPerKm: 0.6718 },
      { type: 'NON_REFL',   locationKm: 1.16062, lossDb: 0.23441, attenDbPerKm: 0.20173 },
      { type: 'F_END',      locationKm: 3.67038, lossDb: null,    reflectanceDb: -71.73 },
    ],
    measuredAt: '2023-03-20T07:08:06+07:00',
    operator: 'Mitra Field Tech',
  };

  async function copySeedOtdrPhoto(src: string): Promise<{ photoId: string; filename: string } | { photoId: null; filename: null }> {
    const fullPath = path.join(OTDR_SEED_DIR, src);
    if (!existsSync(fullPath)) return { photoId: null, filename: null };
    const photoId = randomUUID();
    const ext = (path.extname(src) || '.jpg').toLowerCase();
    const stored = `${photoId}${ext}`;
    const buf = await fs.readFile(fullPath);
    await fs.writeFile(path.join(OTDR_UPLOAD_DIR, stored), buf);
    return { photoId, filename: stored };
  }

  const ph1 = await copySeedOtdrPhoto('OTDR 1.jpg');
  const ph2 = await copySeedOtdrPhoto('OTDR 2.jpg');
  project.otdrTests.push({
    id: 'otdr-001',
    segment: 'A-B',
    core: 'TX',
    sowNumber: 'SOW-PPO21-201-B',
    photoId: ph1.photoId,
    filename: ph1.filename,
    deviceModel: 'MINI OT-8810',
    measuredAt: otdr1Input.measuredAt!,
    operator: otdr1Input.operator!,
    input: otdr1Input,
    analysis: analyzeOtdr(otdr1Input),
    photoQuality: null,
    exif: null,
    notes: 'Initial pigtail acceptance test — short reference fibre.',
    createdAt: new Date().toISOString(),
  });
  project.otdrTests.push({
    id: 'otdr-002',
    segment: 'A-B',
    core: 'RX',
    sowNumber: 'SOW-PPO21-201-B',
    photoId: ph2.photoId,
    filename: ph2.filename,
    deviceModel: 'Optiker OTDR',
    measuredAt: otdr2Input.measuredAt!,
    operator: otdr2Input.operator!,
    input: otdr2Input,
    analysis: analyzeOtdr(otdr2Input),
    photoQuality: null,
    exif: null,
    notes: 'Full link A→B acceptance @1550 nm — flagged for re-splice on connector at 2.5 km.',
    createdAt: new Date().toISOString(),
  });

  projects.set(project.id, project);
}

// ---- Serialisation ----------------------------------------------------------

function projectSummary(p: FiberProject) {
  const route = [p.nearEnd, ...p.poles, p.farEnd];
  const otdrPass = p.otdrTests.filter((t) => t.analysis.overall === 'PASS').length;
  const otdrFail = p.otdrTests.filter((t) => t.analysis.overall === 'FAIL').length;
  const segs = segmentSummary(p);
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    customerName: p.customerName,
    vendorName: p.vendorName,
    status: p.status,
    polesTagged: p.poles.length,
    estimatedLengthMeters: Math.round(totalLengthMeters(route)),
    nearEnd: p.nearEnd,
    farEnd: p.farEnd,
    createdAt: p.createdAt,
    otdrTestsTotal: p.otdrTests.length,
    otdrTestsPass: otdrPass,
    otdrTestsFail: otdrFail,
    segmentsTotal: segs.length,
    segmentsComplete: segs.filter((s) => s.status === 'COMPLETE').length,
    segmentsFailed: segs.filter((s) => s.status === 'FAILED').length,
  };
}

function projectDetail(p: FiberProject) {
  const route = [p.nearEnd, ...p.poles, p.farEnd];
  return {
    ...projectSummary(p),
    description: p.description,
    poles: p.poles.map((pole) => ({
      id: pole.id,
      sequence: pole.sequence,
      photoUrl: `/v1/fiber-projects/${p.id}/photos/${pole.photoId}/file`,
      latitude: pole.latitude,
      longitude: pole.longitude,
      capturedAt: pole.capturedAt,
      uploadedAt: pole.uploadedAt,
      uploadedBy: pole.uploadedBy,
      note: pole.note,
    })),
    routeGeoJson: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route.map((p) => [p.longitude, p.latitude]),
      },
      properties: { code: p.code, name: p.name },
    },
    otdrTests: p.otdrTests.map((t) => serialiseOtdr(p.id, t)),
    segments: segmentSummary(p),
  };
}

function serialiseOtdr(projectId: string, t: OtdrTest) {
  return {
    id: t.id,
    segment: t.segment,
    core: t.core,
    sowNumber: t.sowNumber ?? null,
    deviceModel: t.deviceModel,
    measuredAt: t.measuredAt,
    operator: t.operator,
    notes: t.notes,
    photoUrl: t.photoId ? `/v1/fiber-projects/${projectId}/otdr/${t.id}/photo` : null,
    photoQuality: t.photoQuality,
    exif: t.exif,
    input: t.input,
    analysis: t.analysis,
    createdAt: t.createdAt,
  };
}

// Aggregate completion: a segment is COMPLETE only when BOTH cores (TX & RX)
// have at least one PASS test. MARGINAL counts as in-progress; FAIL blocks.
function segmentSummary(p: FiberProject) {
  const bySegment = new Map<string, { tx: OtdrTest[]; rx: OtdrTest[] }>();
  for (const t of p.otdrTests) {
    if (!bySegment.has(t.segment)) bySegment.set(t.segment, { tx: [], rx: [] });
    const slot = bySegment.get(t.segment)!;
    if (t.core === 'TX') slot.tx.push(t); else slot.rx.push(t);
  }
  return Array.from(bySegment.entries()).map(([segment, slot]) => {
    const txPass = slot.tx.some((t) => t.analysis.overall === 'PASS');
    const rxPass = slot.rx.some((t) => t.analysis.overall === 'PASS');
    const anyFail = [...slot.tx, ...slot.rx].some((t) => t.analysis.overall === 'FAIL');
    let status: 'COMPLETE' | 'INCOMPLETE' | 'FAILED' = 'INCOMPLETE';
    if (anyFail) status = 'FAILED';
    else if (txPass && rxPass) status = 'COMPLETE';
    return {
      segment,
      status,
      txCount: slot.tx.length,
      rxCount: slot.rx.length,
      txPass,
      rxPass,
      sowNumber: (slot.tx[0] ?? slot.rx[0])?.sowNumber ?? null,
    };
  });
}

// ---- Routes -----------------------------------------------------------------

const UploadQuery = z.object({
  uploadedBy: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  // Allow client-supplied GPS as a fallback when device-captured photos lack EXIF.
  fallbackLatitude: z.coerce.number().min(-90).max(90).optional(),
  fallbackLongitude: z.coerce.number().min(-180).max(180).optional(),
  fallbackCapturedAt: z.string().datetime().optional(),
});

export async function fiberProjectsRoutes(app: FastifyInstance): Promise<void> {
  await seedDemoProject();

  // Maps a real (DB-backed) SOW number to its fiber project so the order
  // detail page can render an inline tagging panel inside the relevant SOW
  // (e.g. the "Link A–B" cable-pulling SOW).
  const SOW_FIBER_LINKS: Record<string, string> = {
    'SOW-PPO21-201-B': 'fp-bsd-loop-001',
  };
  // Order-level lookup is derived from SOW links so the order page can also
  // surface a top-level shortcut if any of its SOWs has tagging.
  const ORDER_FIBER_LINKS: Record<string, string> = {
    'PPO21-201': 'fp-bsd-loop-001',
  };

  // Lookup fiber project by SOW number (rendered inline within an SO/SOW tree)
  app.get('/v1/fiber-projects/by-sow/:sowNumber', async (req, reply) => {
    const { sowNumber } = z.object({ sowNumber: z.string() }).parse(req.params);
    const fiberId = SOW_FIBER_LINKS[sowNumber];
    if (!fiberId) return reply.code(404).send({ code: 'NOT_LINKED' });
    const p = projects.get(fiberId);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
    return { fiberProjectId: fiberId, summary: projectSummary(p) };
  });

  // Lookup fiber project by order number (used by orders detail page)
  app.get('/v1/fiber-projects/by-order/:orderNumber', async (req, reply) => {
    const { orderNumber } = z.object({ orderNumber: z.string() }).parse(req.params);
    const fiberId = ORDER_FIBER_LINKS[orderNumber];
    if (!fiberId) return reply.code(404).send({ code: 'NOT_LINKED' });
    const p = projects.get(fiberId);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
    return { fiberProjectId: fiberId, summary: projectSummary(p) };
  });

  // List
  app.get('/v1/fiber-projects', async () => {
    return { items: Array.from(projects.values()).map(projectSummary) };
  });

  // Detail
  app.get('/v1/fiber-projects/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const p = projects.get(id);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND', detail: 'Fiber project not found' });
    return projectDetail(p);
  });

  // Serve a photo file
  app.get('/v1/fiber-projects/:id/photos/:photoId/file', async (req, reply) => {
    const { id, photoId } = z.object({ id: z.string(), photoId: z.string() }).parse(req.params);
    const p = projects.get(id);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
    const pole = p.poles.find((x) => x.photoId === photoId);
    if (!pole) return reply.code(404).send({ code: 'NOT_FOUND' });
    const filePath = path.join(UPLOAD_DIR, pole.filename);
    if (!existsSync(filePath)) return reply.code(404).send({ code: 'FILE_MISSING' });
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.type('image/jpeg');
    return reply.send(createReadStream(filePath));
  });

  // Upload one photo (multipart)
  app.post('/v1/fiber-projects/:id/photos', async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const p = projects.get(id);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });

    const isMultipart = (req as { isMultipart?: () => boolean }).isMultipart?.();
    if (!isMultipart) return reply.code(415).send({ code: 'UNSUPPORTED_MEDIA_TYPE' });

    const file = await (req as unknown as {
      file: () => Promise<{ filename: string; mimetype: string; toBuffer: () => Promise<Buffer>; fields: Record<string, unknown> } | undefined>;
    }).file();
    if (!file) return reply.code(400).send({ code: 'NO_FILE' });

    const buf = await file.toBuffer();
    if (buf.length === 0) return reply.code(400).send({ code: 'EMPTY_FILE' });
    if (buf.length > 25 * 1024 * 1024) return reply.code(413).send({ code: 'FILE_TOO_LARGE' });

    // Extract optional fields shipped with the multipart body.
    const fieldVal = (k: string): string | undefined => {
      const f = file.fields[k] as { value?: unknown } | undefined;
      return f && typeof f.value === 'string' ? f.value : undefined;
    };
    const parsedQuery = UploadQuery.parse({
      uploadedBy: fieldVal('uploadedBy'),
      note: fieldVal('note'),
      fallbackLatitude: fieldVal('fallbackLatitude'),
      fallbackLongitude: fieldVal('fallbackLongitude'),
      fallbackCapturedAt: fieldVal('fallbackCapturedAt'),
    });

    const gps = await extractGps(buf);
    const latitude = gps.latitude ?? parsedQuery.fallbackLatitude ?? null;
    const longitude = gps.longitude ?? parsedQuery.fallbackLongitude ?? null;
    if (latitude == null || longitude == null) {
      return reply.code(422).send({
        code: 'NO_GPS_METADATA',
        detail: 'Photo has no GPS metadata and no fallback coordinates provided. Enable location tagging on the camera and re-take the photo.',
      });
    }

    const photoId = randomUUID();
    const ext = (path.extname(file.filename) || '.jpg').toLowerCase();
    const storedName = `${photoId}${ext}`;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, storedName), buf);

    const pole: Pole = {
      id: randomUUID(),
      sequence: 0,
      photoId,
      filename: storedName,
      latitude,
      longitude,
      capturedAt: gps.capturedAt ?? parsedQuery.fallbackCapturedAt ?? null,
      uploadedAt: new Date().toISOString(),
      uploadedBy: parsedQuery.uploadedBy ?? 'mitra@demo',
      note: parsedQuery.note ?? '',
    };
    p.poles.push(pole);
    orderPoles(p);

    return reply.code(201).send({
      pole: {
        id: pole.id,
        sequence: pole.sequence,
        photoUrl: `/v1/fiber-projects/${p.id}/photos/${pole.photoId}/file`,
        latitude: pole.latitude,
        longitude: pole.longitude,
        capturedAt: pole.capturedAt,
        uploadedAt: pole.uploadedAt,
        uploadedBy: pole.uploadedBy,
        note: pole.note,
      },
      gpsSource: gps.latitude != null ? 'exif' : 'fallback',
      project: projectSummary(p),
    });
  });

  // Delete a pole (mitra correction)
  app.delete('/v1/fiber-projects/:id/poles/:poleId', async (req, reply) => {
    const { id, poleId } = z.object({ id: z.string(), poleId: z.string() }).parse(req.params);
    const p = projects.get(id);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
    const idx = p.poles.findIndex((x) => x.id === poleId);
    if (idx < 0) return reply.code(404).send({ code: 'NOT_FOUND' });
    const [removed] = p.poles.splice(idx, 1);
    const filePath = path.join(UPLOAD_DIR, removed.filename);
    await fs.unlink(filePath).catch(() => undefined);
    orderPoles(p);
    return { ok: true, project: projectSummary(p) };
  });

  // ---- OTDR endpoints -------------------------------------------------------

  // List OTDR tests for a project (optionally filter by segment or SOW)
  app.get('/v1/fiber-projects/:id/otdr', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const q = z.object({ segment: z.string().optional(), sowNumber: z.string().optional() }).parse(req.query);
    const p = projects.get(id);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
    let tests = p.otdrTests;
    if (q.segment) tests = tests.filter((t) => t.segment === q.segment);
    if (q.sowNumber) tests = tests.filter((t) => t.sowNumber === q.sowNumber);
    return { items: tests.map((t) => serialiseOtdr(p.id, t)) };
  });

  // Convenience: list OTDR tests for a SOW (any project)
  app.get('/v1/fiber-projects/by-sow/:sowNumber/otdr', async (req, reply) => {
    const { sowNumber } = z.object({ sowNumber: z.string() }).parse(req.params);
    const out: ReturnType<typeof serialiseOtdr>[] = [];
    for (const p of projects.values()) {
      for (const t of p.otdrTests) if (t.sowNumber === sowNumber) out.push(serialiseOtdr(p.id, t));
    }
    if (out.length === 0) return reply.code(404).send({ code: 'NOT_FOUND' });
    return { items: out };
  });

  // OTDR test detail
  app.get('/v1/fiber-projects/:id/otdr/:testId', async (req, reply) => {
    const { id, testId } = z.object({ id: z.string(), testId: z.string() }).parse(req.params);
    const p = projects.get(id);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
    const t = p.otdrTests.find((x) => x.id === testId);
    if (!t) return reply.code(404).send({ code: 'NOT_FOUND' });
    return serialiseOtdr(p.id, t);
  });

  // Serve OTDR photo
  app.get('/v1/fiber-projects/:id/otdr/:testId/photo', async (req, reply) => {
    const { id, testId } = z.object({ id: z.string(), testId: z.string() }).parse(req.params);
    const p = projects.get(id);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });
    const t = p.otdrTests.find((x) => x.id === testId);
    if (!t || !t.filename) return reply.code(404).send({ code: 'NOT_FOUND' });
    const filePath = path.join(OTDR_UPLOAD_DIR, t.filename);
    if (!existsSync(filePath)) return reply.code(404).send({ code: 'FILE_MISSING' });
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.type('image/jpeg');
    return reply.send(createReadStream(filePath));
  });

  // Create OTDR test (multipart: optional `photo` file + `payload` JSON string)
  // The payload follows OtdrTestInput so the analyzer can score it server-side.
  app.post('/v1/fiber-projects/:id/otdr', async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const p = projects.get(id);
    if (!p) return reply.code(404).send({ code: 'NOT_FOUND' });

    const isMultipart = (req as { isMultipart?: () => boolean }).isMultipart?.();
    if (!isMultipart) return reply.code(415).send({ code: 'UNSUPPORTED_MEDIA_TYPE' });

    const file = await (req as unknown as {
      file: () => Promise<{ filename: string; mimetype: string; toBuffer: () => Promise<Buffer>; fields: Record<string, unknown> } | undefined>;
    }).file();
    if (!file) return reply.code(400).send({ code: 'NO_FILE' });

    const fieldVal = (k: string): string | undefined => {
      const f = file.fields[k] as { value?: unknown } | undefined;
      return f && typeof f.value === 'string' ? f.value : undefined;
    };

    const payloadRaw = fieldVal('payload');
    if (!payloadRaw) return reply.code(400).send({ code: 'MISSING_PAYLOAD' });
    let payload: OtdrTestInput;
    try { payload = JSON.parse(payloadRaw) as OtdrTestInput; }
    catch { return reply.code(400).send({ code: 'INVALID_JSON' }); }

    const buf = await file.toBuffer();
    let photoId: string | null = null;
    let storedName: string | null = null;
    let quality: PhotoQualityCheck | null = null;
    let exif: Record<string, unknown> | null = null;
    if (buf.length > 0) {
      // ---- Photo quality gate ------------------------------------------------
      // Reject unreadable / tampered shots BEFORE persisting any data.
      quality = await checkOtdrPhotoQuality(buf);
      if (!quality.ok) {
        return reply.code(422).send({
          code: 'OTDR_PHOTO_REJECTED',
          detail: 'Foto OTDR tidak memenuhi syarat pembacaan. Silakan ambil ulang foto dari layar OTDR.',
          failures: quality.failures,
          meta: quality.meta,
        });
      }
      // Capture full EXIF for archival
      try {
        exif = (await exifr.parse(buf, { ifd0: true, exif: true, gps: true, tiff: true })) as Record<string, unknown> | null;
      } catch {
        exif = null;
      }
      photoId = randomUUID();
      const ext = (path.extname(file.filename) || '.jpg').toLowerCase();
      storedName = `${photoId}${ext}`;
      await fs.mkdir(OTDR_UPLOAD_DIR, { recursive: true });
      await fs.writeFile(path.join(OTDR_UPLOAD_DIR, storedName), buf);
    }

    const coreRaw = (fieldVal('core') ?? 'TX').toUpperCase();
    const core: 'TX' | 'RX' = coreRaw === 'RX' ? 'RX' : 'TX';

    const test: OtdrTest = {
      id: randomUUID(),
      segment: fieldVal('segment') ?? 'A-B',
      core,
      sowNumber: fieldVal('sowNumber'),
      photoId,
      filename: storedName,
      deviceModel: fieldVal('deviceModel') ?? 'Unknown OTDR',
      measuredAt: payload.measuredAt ?? quality?.meta.capturedAt ?? new Date().toISOString(),
      operator: payload.operator ?? fieldVal('operator') ?? 'mitra@demo',
      input: payload,
      analysis: analyzeOtdr(payload),
      photoQuality: quality,
      exif,
      notes: fieldVal('notes') ?? '',
      createdAt: new Date().toISOString(),
    };
    p.otdrTests.push(test);
    return reply.code(201).send({
      test: serialiseOtdr(p.id, test),
      project: projectSummary(p),
      segments: segmentSummary(p),
    });
  });
}
