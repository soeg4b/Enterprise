'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import 'leaflet/dist/leaflet.css';
import { API_URL } from '../../../../../../lib/api';

type Pole = {
  id: string;
  sequence: number;
  photoUrl: string;
  latitude: number;
  longitude: number;
  capturedAt: string | null;
  uploadedAt: string;
  uploadedBy: string;
  note: string;
};

type ProjectDetail = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  vendorName: string;
  description: string;
  status: string;
  polesTagged: number;
  estimatedLengthMeters: number;
  nearEnd: { name: string; address?: string; latitude: number; longitude: number };
  farEnd: { name: string; address?: string; latitude: number; longitude: number };
  poles: Pole[];
  otdrTests?: OtdrTest[];
  segments?: SegmentSummary[];
};

type SegmentSummary = {
  segment: string;
  status: 'COMPLETE' | 'INCOMPLETE' | 'FAILED';
  txCount: number;
  rxCount: number;
  txPass: boolean;
  rxPass: boolean;
  sowNumber: string | null;
};

type OtdrEvent = {
  type: 'F_START' | 'NON_REFL' | 'REFLECTIVE' | 'F_END';
  locationKm: number;
  lossDb?: number | null;
  reflectanceDb?: number | null;
  attenDbPerKm?: number | null;
  index: number;
  verdict: 'GOOD' | 'WARN' | 'FAIL';
  reason: string;
};

type OtdrTest = {
  id: string;
  segment: string;
  core: 'TX' | 'RX';
  sowNumber: string | null;
  deviceModel: string;
  measuredAt: string;
  operator: string;
  notes: string;
  photoUrl: string | null;
  photoQuality?: { ok: boolean; failures: string[] } | null;
  exif?: Record<string, unknown> | null;
  input: {
    wavelengthNm: number;
    pulseWidthNs: number;
    scanRangeKm: number;
    iorIndex?: number;
    totalLengthKm: number;
    totalLossDb: number;
  };
  analysis: {
    wavelengthNm: number;
    totalLengthKm: number;
    totalLossDb: number;
    avgLossDbPerKm: number;
    attenuationTargetDbPerKm: number;
    linkBudgetDb: number;
    spliceCount: number;
    connectorCount: number;
    events: OtdrEvent[];
    overall: 'PASS' | 'MARGINAL' | 'FAIL';
    notes: string[];
  };
};

export default function FiberProjectDetail() {
  const params = useParams<{ id: string; fiberId: string }>();
  const id = params?.fiberId as string;
  const programId = params?.id as string;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Pole | null>(null);

  const mapRef = useRef<HTMLDivElement | null>(null);
  // Keep handles in a ref so React strict-mode's double-effect does NOT
  // initialise Leaflet twice (which throws "Map container is already
  // initialized."). Cleanup always tears the map down.
  const stateRef = useRef<{ map: any; markers: Record<string, any> } | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/v1/fiber-projects/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as ProjectDetail;
      setProject(data);
    } catch (e) {
      setError(String(e));
    }
  }, [id]);

  useEffect(() => { void reload(); }, [reload]);

  // Initialise the map & redraw whenever project changes.
  useEffect(() => {
    if (!project || !mapRef.current) return;
    let cancelled = false;

    void (async () => {
      const mod = await import('leaflet');
      const L = (mod as any).default ?? mod;
      if (cancelled || !mapRef.current) return;

      // Tear down any prior instance (strict-mode re-run OR project reload).
      if (stateRef.current?.map) {
        stateRef.current.map.remove();
        stateRef.current = null;
      }

      const map = L.map(mapRef.current).setView(
        [project.nearEnd.latitude, project.nearEnd.longitude],
        16,
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      const markers: Record<string, any> = {};

      const coords: [number, number][] = [
        [project.nearEnd.latitude, project.nearEnd.longitude],
        ...project.poles.map((p) => [p.latitude, p.longitude] as [number, number]),
        [project.farEnd.latitude, project.farEnd.longitude],
      ];

      L.polyline(coords, { color: '#0ea5e9', weight: 4, opacity: 0.85 }).addTo(map);

      // ---- Spread overlapping markers ---------------------------------------
      // Group poles by their GPS bucket (rounded to ~1m). For each bucket with
      // multiple photos, lay them out in a small circle around the centre so
      // every photo is selectable.
      const groups = new Map<string, Pole[]>();
      project.poles.forEach((p) => {
        const k = `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;
        const arr = groups.get(k) ?? [];
        arr.push(p);
        groups.set(k, arr);
      });
      const displayCoords: Record<string, [number, number]> = {};
      // ~1° latitude ≈ 111_320 m. We use ~6m radius for the circle.
      const radiusMeters = 6;
      groups.forEach((arr) => {
        if (arr.length === 1) {
          displayCoords[arr[0].id] = [arr[0].latitude, arr[0].longitude];
          return;
        }
        arr.forEach((p, i) => {
          const angle = (i / arr.length) * Math.PI * 2;
          const dLat = (radiusMeters / 111320) * Math.sin(angle);
          const dLon = (radiusMeters / (111320 * Math.cos((p.latitude * Math.PI) / 180))) * Math.cos(angle);
          displayCoords[p.id] = [p.latitude + dLat, p.longitude + dLon];
        });
      });

      const neIcon = L.divIcon({
        className: '',
        html: '<div style="background:#16a34a;color:white;padding:4px 8px;border-radius:6px;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)">NE</div>',
        iconSize: [40, 24], iconAnchor: [20, 12],
      });
      const feIcon = L.divIcon({
        className: '',
        html: '<div style="background:#dc2626;color:white;padding:4px 8px;border-radius:6px;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)">FE</div>',
        iconSize: [40, 24], iconAnchor: [20, 12],
      });
      L.marker([project.nearEnd.latitude, project.nearEnd.longitude], { icon: neIcon })
        .bindPopup(`<b>${project.nearEnd.name}</b><br/>${project.nearEnd.address ?? ''}`)
        .addTo(map);
      L.marker([project.farEnd.latitude, project.farEnd.longitude], { icon: feIcon })
        .bindPopup(`<b>${project.farEnd.name}</b><br/>${project.farEnd.address ?? ''}`)
        .addTo(map);

      project.poles.forEach((pole) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:#0ea5e9;color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)">${pole.sequence}</div>`,
          iconSize: [26, 26], iconAnchor: [13, 13],
        });
        // Many photos share identical GPS coords (taken at the same pole).
        // Spread overlapping markers around the original point so each photo
        // is visible & clickable. ~4m radius per offset slot.
        const display = displayCoords[pole.id] ?? [pole.latitude, pole.longitude];
        const m = L.marker(display, { icon })
          .bindPopup(
            `<div style="text-align:center;min-width:180px"><b>Pole #${pole.sequence}</b><br/>` +
            `<img src="${API_URL}${pole.photoUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:180px;height:135px;object-fit:cover;margin-top:6px;border-radius:4px;display:block" />` +
            `<small style="display:block;margin-top:4px">${pole.latitude.toFixed(6)}, ${pole.longitude.toFixed(6)}</small>` +
            `<small>${pole.capturedAt ? new Date(pole.capturedAt).toLocaleString() : '—'}</small>` +
            `<button data-pole-id="${pole.id}" class="pole-zoom-btn" style="margin-top:6px;padding:4px 8px;background:#0f172a;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px">View full photo</button>` +
            `</div>`,
          )
          .on('click', () => setHighlightId(pole.id))
          .on('popupopen', (ev: any) => {
            const btn = ev.popup.getElement()?.querySelector('.pole-zoom-btn');
            if (btn) btn.addEventListener('click', () => setLightbox(pole));
          })
          .addTo(map);
        markers[pole.id] = m;
      });

      try { map.fitBounds(coords as any, { padding: [40, 40] }); } catch { /* ignore */ }
      // The container's final size is sometimes only known after layout.
      setTimeout(() => map.invalidateSize(), 100);

      stateRef.current = { map, markers };
    })();

    return () => {
      cancelled = true;
      if (stateRef.current?.map) {
        stateRef.current.map.remove();
        stateRef.current = null;
      }
    };
  }, [project]);

  function focusPole(p: Pole) {
    setHighlightId(p.id);
    const s = stateRef.current;
    if (s?.map) {
      s.map.setView([p.latitude, p.longitude], 18);
      const m = s.markers[p.id];
      if (m) m.openPopup();
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('photo') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) { setUploadMsg('Select a photo first.'); return; }

    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append('uploadedBy', (form.elements.namedItem('uploadedBy') as HTMLInputElement).value || 'mitra@demo');
      fd.append('note', (form.elements.namedItem('note') as HTMLInputElement).value || '');
      fd.append('photo', file);

      const r = await fetch(`${API_URL}/v1/fiber-projects/${id}/photos`, {
        method: 'POST',
        body: fd,
      });
      const j = await r.json();
      if (!r.ok) {
        setUploadMsg(`Upload failed: ${j.detail ?? j.code ?? r.status}`);
      } else {
        setUploadMsg(`Pole #${j.pole.sequence} added. GPS source: ${j.gpsSource.toUpperCase()}.`);
        form.reset();
        await reload();
      }
    } catch (err) {
      setUploadMsg(`Error: ${String(err)}`);
    } finally {
      setUploading(false);
    }
  }

  async function deletePole(pole: Pole) {
    if (!confirm(`Delete pole #${pole.sequence}?`)) return;
    const r = await fetch(`${API_URL}/v1/fiber-projects/${id}/poles/${pole.id}`, { method: 'DELETE' });
    if (r.ok) await reload();
  }

  const [otdrUploading, setOtdrUploading] = useState(false);
  const [otdrMsg, setOtdrMsg] = useState<{ kind: 'ok' | 'err'; text: string; failures?: string[] } | null>(null);

  async function handleOtdrUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('photo') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) { setOtdrMsg({ kind: 'err', text: 'Pilih foto layar OTDR terlebih dahulu.' }); return; }

    const get = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
    // Minimal payload — operator entry of measurement values shown on the OTDR screen.
    const payload = {
      wavelengthNm: Number(get('wavelengthNm')),
      pulseWidthNs: Number(get('pulseWidthNs')),
      scanRangeKm: Number(get('scanRangeKm')),
      totalLengthKm: Number(get('totalLengthKm')),
      totalLossDb: Number(get('totalLossDb')),
      events: [
        { type: 'F_START', locationKm: 0 },
        { type: 'F_END', locationKm: Number(get('totalLengthKm')) },
      ],
      operator: get('operator') || 'mitra@demo',
    };

    setOtdrUploading(true);
    setOtdrMsg(null);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('payload', JSON.stringify(payload));
      fd.append('segment', get('segment'));
      fd.append('core', get('core'));
      fd.append('sowNumber', get('sowNumber') || '');
      fd.append('deviceModel', get('deviceModel') || '');
      fd.append('operator', get('operator') || 'mitra@demo');
      fd.append('notes', get('notes') || '');

      const r = await fetch(`${API_URL}/v1/fiber-projects/${id}/otdr`, { method: 'POST', body: fd });
      const j = await r.json();
      if (r.status === 422 && j.code === 'OTDR_PHOTO_REJECTED') {
        setOtdrMsg({
          kind: 'err',
          text: 'Foto OTDR ditolak — silakan ambil ulang foto.',
          failures: j.failures,
        });
        return;
      }
      if (!r.ok) {
        setOtdrMsg({ kind: 'err', text: `Upload gagal: ${j.detail ?? j.code ?? r.status}` });
        return;
      }
      setOtdrMsg({ kind: 'ok', text: `Test ${j.test.core} disimpan. Verdict: ${j.test.analysis.overall}.` });
      form.reset();
      await reload();
    } catch (err) {
      setOtdrMsg({ kind: 'err', text: `Error: ${String(err)}` });
    } finally {
      setOtdrUploading(false);
    }
  }

  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!project) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <div>
          <Link href={`/orders/${programId}`} className="text-xs text-sky-600 underline">← Back to order</Link>
          <h2 className="text-xl md:text-2xl font-bold mt-1">{project.name}</h2>
          <div className="text-sm text-slate-500">{project.code} · {project.customerName}</div>
        </div>
        <div className="flex gap-3 text-xs">
          <Stat label="Poles" value={String(project.polesTagged)} />
          <Stat label="Length" value={`${(project.estimatedLengthMeters / 1000).toFixed(2)} km`} />
          <Stat label="Status" value={project.status} />
        </div>
      </div>

      <p className="text-sm text-slate-600 bg-white p-3 rounded border border-slate-200">{project.description}</p>

      <div className="grid md:grid-cols-2 gap-3">
        <Endpoint title="Near End (NE)" badge="NE" color="bg-green-600" data={project.nearEnd} />
        <Endpoint title="Far End (FE)" badge="FE" color="bg-red-600" data={project.farEnd} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-semibold">Route Map</h3>
            <span className="text-xs text-slate-500">NE → {project.poles.length} poles → FE</span>
          </div>
          <div ref={mapRef} style={{ height: 480, width: '100%' }} />
        </div>

        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-2 border-b border-slate-200">
            <h3 className="font-semibold">Add a Pole (Tagging)</h3>
            <p className="text-xs text-slate-500">Take a photo on-site or upload from device. GPS is read from EXIF.</p>
          </div>
          <form onSubmit={handleUpload} className="p-4 space-y-3 text-sm">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Photo (JPEG with GPS)</label>
              <input
                name="photo"
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                required
                className="w-full text-sm"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                On a phone, this opens the camera. On desktop, file picker.
              </p>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Mitra (email)</label>
              <input
                name="uploadedBy"
                type="email"
                placeholder="mitra@vendor.co.id"
                defaultValue="mitra@demo"
                className="w-full border border-slate-300 rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Note</label>
              <input
                name="note"
                type="text"
                placeholder="Pole condition / remarks"
                className="w-full border border-slate-300 rounded px-2 py-1"
              />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-slate-900 text-white py-2 rounded disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload & Tag Pole'}
            </button>
            {uploadMsg && <div className="text-xs text-slate-700">{uploadMsg}</div>}
          </form>
        </div>
      </div>

      {project.otdrTests && project.otdrTests.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">OTDR Acceptance Tests ({project.otdrTests.length})</h3>
              <p className="text-xs text-slate-500">Setiap segment butuh pengukuran <b>2 core (TX & RX)</b> dengan verdict PASS untuk dianggap COMPLETE.</p>
            </div>
            <div className="flex gap-2 text-[11px]">
              {(['PASS','MARGINAL','FAIL'] as const).map((v) => {
                const c = project.otdrTests!.filter((t) => t.analysis.overall === v).length;
                return c > 0 ? <VerdictPill key={v} v={v}>{c} {v}</VerdictPill> : null;
              })}
            </div>
          </div>
          {project.segments && project.segments.length > 0 && (
            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Segment Completion (TX + RX required)</div>
              <div className="flex flex-wrap gap-2">
                {project.segments.map((s) => (
                  <div key={s.segment} className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1 text-xs">
                    <span className="font-semibold">{s.segment}</span>
                    <span className={s.txPass ? 'text-emerald-700' : 'text-slate-400'}>TX {s.txPass ? '✓' : `·${s.txCount}`}</span>
                    <span className={s.rxPass ? 'text-emerald-700' : 'text-slate-400'}>RX {s.rxPass ? '✓' : `·${s.rxCount}`}</span>
                    <VerdictPill v={s.status === 'COMPLETE' ? 'PASS' : s.status === 'FAILED' ? 'FAIL' : 'WARN'}>{s.status}</VerdictPill>
                  </div>
                ))}
              </div>
            </div>
          )}
          <details className="border-b border-slate-100">
            <summary className="px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-slate-50">
              + Upload OTDR Reading (foto layar device + nilai pengukuran)
            </summary>
            <form onSubmit={handleOtdrUpload} className="px-4 py-3 grid md:grid-cols-3 gap-3 text-xs bg-slate-50">
              <label className="space-y-1">
                <div className="text-slate-600">Segment</div>
                <input name="segment" defaultValue="A-B" required className="w-full border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="space-y-1">
                <div className="text-slate-600">Core</div>
                <select name="core" required className="w-full border border-slate-300 rounded px-2 py-1">
                  <option value="TX">TX (Transmit)</option>
                  <option value="RX">RX (Receive)</option>
                </select>
              </label>
              <label className="space-y-1">
                <div className="text-slate-600">SOW Number</div>
                <input name="sowNumber" defaultValue="SOW-PPO21-201-B" className="w-full border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="space-y-1">
                <div className="text-slate-600">Wavelength (nm)</div>
                <select name="wavelengthNm" required defaultValue="1310" className="w-full border border-slate-300 rounded px-2 py-1">
                  <option value="1310">1310</option>
                  <option value="1550">1550</option>
                  <option value="1625">1625</option>
                </select>
              </label>
              <label className="space-y-1">
                <div className="text-slate-600">Pulse Width (ns)</div>
                <input name="pulseWidthNs" type="number" min="0" defaultValue="100" required className="w-full border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="space-y-1">
                <div className="text-slate-600">Scan Range (km)</div>
                <input name="scanRangeKm" type="number" step="0.01" defaultValue="5" required className="w-full border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="space-y-1">
                <div className="text-slate-600">Total Length (km)</div>
                <input name="totalLengthKm" type="number" step="0.0001" required className="w-full border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="space-y-1">
                <div className="text-slate-600">Total Loss (dB)</div>
                <input name="totalLossDb" type="number" step="0.01" required className="w-full border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="space-y-1">
                <div className="text-slate-600">Device Model</div>
                <input name="deviceModel" placeholder="e.g. EXFO MAX-730C" className="w-full border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <div className="text-slate-600">Operator (email)</div>
                <input name="operator" type="email" defaultValue="mitra@demo" className="w-full border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="space-y-1">
                <div className="text-slate-600">Notes</div>
                <input name="notes" className="w-full border border-slate-300 rounded px-2 py-1" />
              </label>
              <label className="space-y-1 md:col-span-3">
                <div className="text-slate-600">Foto Layar OTDR (JPEG dari kamera, EXIF wajib ada)</div>
                <input name="photo" type="file" accept="image/jpeg,image/png" capture="environment" required className="w-full text-sm" />
                <div className="text-[10px] text-slate-500">Min. 1024×768 · ≥ 60 KB · EXIF Make/Model wajib · bukan screenshot.</div>
              </label>
              <div className="md:col-span-3 flex items-center gap-3">
                <button type="submit" disabled={otdrUploading} className="bg-slate-900 text-white px-4 py-2 rounded text-xs font-semibold disabled:opacity-50">
                  {otdrUploading ? 'Memvalidasi & menyimpan…' : 'Upload OTDR Test'}
                </button>
                {otdrMsg && (
                  <div className={`text-xs ${otdrMsg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    <div className="font-semibold">{otdrMsg.text}</div>
                    {otdrMsg.failures && otdrMsg.failures.length > 0 && (
                      <ul className="list-disc pl-5 mt-1">
                        {otdrMsg.failures.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </form>
          </details>
          <div className="divide-y divide-slate-100">
            {project.otdrTests.map((t) => <OtdrTestCard key={t.id} t={t} />)}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-2 border-b border-slate-200">
          <h3 className="font-semibold">Pole Inventory ({project.poles.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 text-left">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Photo</th>
                <th className="px-3 py-2">Latitude</th>
                <th className="px-3 py-2">Longitude</th>
                <th className="px-3 py-2">Captured</th>
                <th className="px-3 py-2">Mitra</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {project.poles.map((p) => (
                <tr key={p.id} className={`border-t border-slate-100 ${highlightId === p.id ? 'bg-sky-50' : ''}`}>
                  <td className="px-3 py-2 font-semibold">{p.sequence}</td>
                  <td className="px-3 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${API_URL}${p.photoUrl}`}
                      alt={`Pole ${p.sequence}`}
                      className="w-16 h-16 object-cover rounded cursor-pointer hover:ring-2 hover:ring-sky-500"
                      onClick={() => setLightbox(p)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.latitude.toFixed(6)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.longitude.toFixed(6)}</td>
                  <td className="px-3 py-2 text-xs">{p.capturedAt ? new Date(p.capturedAt).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-xs">{p.uploadedBy}</td>
                  <td className="px-3 py-2 text-xs">{p.note || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => focusPole(p)} className="text-xs text-sky-600 underline mr-2">Focus</button>
                    <button onClick={() => deletePole(p)} className="text-xs text-red-600 underline">Delete</button>
                  </td>
                </tr>
              ))}
              {project.poles.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No poles tagged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-2 border-b border-slate-200">
              <div>
                <div className="font-semibold">Pole #{lightbox.sequence}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {lightbox.latitude.toFixed(6)}, {lightbox.longitude.toFixed(6)}
                  {lightbox.capturedAt && ` · ${new Date(lightbox.capturedAt).toLocaleString()}`}
                </div>
                {lightbox.note && <div className="text-xs text-slate-600 mt-1">Note: {lightbox.note}</div>}
              </div>
              <button
                onClick={() => setLightbox(null)}
                className="text-slate-500 hover:text-slate-900 text-2xl leading-none px-2"
                aria-label="Close"
              >×</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API_URL}${lightbox.photoUrl}`}
              alt={`Pole ${lightbox.sequence}`}
              className="flex-1 object-contain bg-slate-100 min-h-0"
              style={{ maxHeight: 'calc(90vh - 120px)' }}
            />
            <div className="px-4 py-2 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
              <span>Uploaded by {lightbox.uploadedBy}</span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${lightbox.latitude},${lightbox.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-sky-600 underline"
              >Open in Google Maps</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded px-3 py-1 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function Endpoint({ title, badge, color, data }: {
  title: string; badge: string; color: string;
  data: { name: string; address?: string; latitude: number; longitude: number };
}) {
  return (
    <div className="bg-white p-3 rounded border border-slate-200 flex items-start gap-3">
      <span className={`${color} text-white text-xs font-bold px-2 py-1 rounded`}>{badge}</span>
      <div className="flex-1">
        <div className="text-xs text-slate-500">{title}</div>
        <div className="font-semibold text-sm">{data.name}</div>
        {data.address && <div className="text-xs text-slate-500">{data.address}</div>}
        <div className="font-mono text-[11px] text-slate-600 mt-1">
          {data.latitude.toFixed(6)}, {data.longitude.toFixed(6)}
        </div>
      </div>
    </div>
  );
}

function VerdictPill({ v, children }: { v: 'PASS' | 'MARGINAL' | 'FAIL' | 'GOOD' | 'WARN'; children: React.ReactNode }) {
  const cls =
    v === 'PASS' || v === 'GOOD' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
    v === 'MARGINAL' || v === 'WARN' ? 'bg-amber-100 text-amber-800 border-amber-300' :
    'bg-rose-100 text-rose-800 border-rose-300';
  return <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${cls}`}>{children}</span>;
}

function OtdrTestCard({ t }: { t: OtdrTest }) {
  const a = t.analysis;
  return (
    <div className="p-4 grid md:grid-cols-[160px_1fr] gap-4">
      <div>
        {t.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${API_URL}${t.photoUrl}`}
            alt="OTDR screen"
            className="w-full h-32 object-cover rounded border border-slate-200 cursor-zoom-in"
            onClick={() => window.open(`${API_URL}${t.photoUrl}`, '_blank')}
          />
        ) : (
          <div className="w-full h-32 bg-slate-100 rounded text-xs text-slate-400 flex items-center justify-center">no photo</div>
        )}
        <div className="mt-2 text-[11px] text-slate-500">
          <div>{t.deviceModel}</div>
          <div>{new Date(t.measuredAt).toLocaleString('id-ID')}</div>
          <div>by {t.operator}</div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs text-slate-500">
              Segment <b className="text-slate-900">{t.segment}</b>
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${t.core === 'TX' ? 'bg-indigo-100 text-indigo-800' : 'bg-fuchsia-100 text-fuchsia-800'}`}>{t.core} core</span>
              {t.sowNumber && <> · SOW <b className="text-slate-900">{t.sowNumber}</b></>}
            </div>
            <div className="text-sm font-semibold mt-0.5">
              {t.input.wavelengthNm} nm · pulse {t.input.pulseWidthNs} ns · range {t.input.scanRangeKm} km
            </div>
          </div>
          <VerdictPill v={a.overall}>{a.overall}</VerdictPill>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <KV k="Total length" v={`${a.totalLengthKm.toFixed(3)} km`} />
          <KV k="Total loss" v={`${a.totalLossDb.toFixed(2)} dB`} />
          <KV k="Avg atten." v={`${a.avgLossDbPerKm.toFixed(3)} dB/km`} hi={a.avgLossDbPerKm > a.attenuationTargetDbPerKm} />
          <KV k="Target" v={`${a.attenuationTargetDbPerKm.toFixed(2)} dB/km`} />
          <KV k="Link budget" v={`${a.linkBudgetDb.toFixed(2)} dB`} hi={a.totalLossDb > a.linkBudgetDb} />
        </div>

        {a.notes.length > 0 && (
          <ul className="text-[11px] text-slate-600 list-disc pl-5 space-y-0.5">
            {a.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-left">Type</th>
                <th className="px-2 py-1 text-right">Loc (km)</th>
                <th className="px-2 py-1 text-right">Loss (dB)</th>
                <th className="px-2 py-1 text-right">Atten (dB/km)</th>
                <th className="px-2 py-1 text-right">ORL (dB)</th>
                <th className="px-2 py-1 text-left">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {a.events.map((e) => (
                <tr key={e.index} className="border-t border-slate-100">
                  <td className="px-2 py-1">{e.index}</td>
                  <td className="px-2 py-1">{e.type}</td>
                  <td className="px-2 py-1 text-right font-mono">{e.locationKm.toFixed(3)}</td>
                  <td className="px-2 py-1 text-right font-mono">{e.lossDb != null ? e.lossDb.toFixed(3) : '—'}</td>
                  <td className="px-2 py-1 text-right font-mono">{e.attenDbPerKm != null ? e.attenDbPerKm.toFixed(3) : '—'}</td>
                  <td className="px-2 py-1 text-right font-mono">{e.reflectanceDb != null ? e.reflectanceDb.toFixed(2) : '—'}</td>
                  <td className="px-2 py-1"><VerdictPill v={e.verdict}>{e.verdict}</VerdictPill> <span className="text-slate-500 ml-1">{e.reason}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {t.notes && <div className="text-[11px] text-slate-600 italic">{t.notes}</div>}
      </div>
    </div>
  );
}

function KV({ k, v, hi }: { k: string; v: string; hi?: boolean }) {
  return (
    <div className={`rounded border p-2 ${hi ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{k}</div>
      <div className="font-semibold font-mono">{v}</div>
    </div>
  );
}
