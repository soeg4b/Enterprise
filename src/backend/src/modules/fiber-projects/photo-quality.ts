// =============================================================================
// OTDR Photo Quality Filter
// -----------------------------------------------------------------------------
// Validates whether an OTDR screen photo is good enough to be archived as
// evidence + parsed for measurements. The check is deterministic and uses
// only EXIF + JPEG header data (no heavy image-processing dependency).
//
// Heuristics (all must pass):
//   1. File size       ≥ 60 KB         (rules out heavily-compressed snippets)
//   2. Dimensions      ≥ 1024 × 768    (LCD readability)
//   3. EXIF Make+Model present         (proves real camera capture)
//   4. EXIF DateTimeOriginal present   (proves on-site capture)
//   5. Software tag is not a screenshot or editor (anti-tamper)
//   6. Aspect ratio between 0.5 and 2.5 (typical phone landscape/portrait)
// =============================================================================

import exifr from 'exifr';

export interface PhotoQualityCheck {
  ok: boolean;
  failures: string[];
  meta: {
    sizeBytes: number;
    width: number | null;
    height: number | null;
    make: string | null;
    model: string | null;
    software: string | null;
    capturedAt: string | null;
    latitude: number | null;
    longitude: number | null;
    orientation: number | null;
  };
}

const MIN_SIZE_BYTES = 60 * 1024;
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 768;
const FORBIDDEN_SOFTWARE = /screenshot|paint|gimp|photoshop|snipping|lightshot|greenshot/i;

export async function checkOtdrPhotoQuality(buffer: Buffer): Promise<PhotoQualityCheck> {
  const failures: string[] = [];
  const meta: PhotoQualityCheck['meta'] = {
    sizeBytes: buffer.length,
    width: null,
    height: null,
    make: null,
    model: null,
    software: null,
    capturedAt: null,
    latitude: null,
    longitude: null,
    orientation: null,
  };

  // 1. File size
  if (buffer.length < MIN_SIZE_BYTES) {
    failures.push(`File terlalu kecil (${(buffer.length / 1024).toFixed(0)} KB < ${MIN_SIZE_BYTES / 1024} KB) — kemungkinan blur/low-res.`);
  }

  // Parse EXIF + image metadata
  let raw: Record<string, unknown> | undefined;
  try {
    raw = await exifr.parse(buffer, { ifd0: true, exif: true, gps: true, tiff: true } as never);
  } catch {
    raw = undefined;
  }

  if (!raw) {
    failures.push('Tidak ada metadata EXIF — foto mungkin dimanipulasi atau bukan dari kamera perangkat.');
    return { ok: false, failures, meta };
  }

  const w = (raw.ExifImageWidth as number | undefined) ?? (raw.ImageWidth as number | undefined) ?? null;
  const h = (raw.ExifImageHeight as number | undefined) ?? (raw.ImageHeight as number | undefined) ?? null;
  meta.width = typeof w === 'number' ? w : null;
  meta.height = typeof h === 'number' ? h : null;
  meta.make = typeof raw.Make === 'string' ? raw.Make : null;
  meta.model = typeof raw.Model === 'string' ? raw.Model : null;
  meta.software = typeof raw.Software === 'string' ? raw.Software : null;
  meta.orientation = typeof raw.Orientation === 'number' ? raw.Orientation : null;
  if (raw.DateTimeOriginal instanceof Date) meta.capturedAt = raw.DateTimeOriginal.toISOString();
  else if (typeof raw.DateTimeOriginal === 'string') meta.capturedAt = raw.DateTimeOriginal;
  if (typeof raw.latitude === 'number') meta.latitude = raw.latitude as number;
  if (typeof raw.longitude === 'number') meta.longitude = raw.longitude as number;

  // 2. Dimensions
  if (meta.width == null || meta.height == null) {
    failures.push('Resolusi gambar tidak terdeteksi.');
  } else {
    if (meta.width < MIN_WIDTH || meta.height < MIN_HEIGHT) {
      failures.push(`Resolusi terlalu kecil (${meta.width}×${meta.height} < ${MIN_WIDTH}×${MIN_HEIGHT}).`);
    }
    const ratio = meta.width / meta.height;
    if (ratio < 0.5 || ratio > 2.5) {
      failures.push(`Aspect ratio tidak wajar (${ratio.toFixed(2)}) — pastikan layar OTDR terambil utuh.`);
    }
  }

  // 3-4. EXIF camera + timestamp
  if (!meta.make || !meta.model) {
    failures.push('EXIF Make/Model kosong — foto mungkin bukan dari kamera ponsel.');
  }
  if (!meta.capturedAt) {
    failures.push('EXIF DateTimeOriginal kosong — tidak ada bukti waktu pengambilan.');
  }

  // 5. Anti-tamper: editor / screenshot software
  if (meta.software && FORBIDDEN_SOFTWARE.test(meta.software)) {
    failures.push(`Foto tampaknya hasil edit/screenshot (Software="${meta.software}").`);
  }

  return { ok: failures.length === 0, failures, meta };
}
