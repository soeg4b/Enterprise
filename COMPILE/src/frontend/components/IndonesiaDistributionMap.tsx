'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import indonesiaMap from '@svg-maps/indonesia';

type ProvinceRow = {
  province: string;
  totalProjects: number;
};

type MappedProvince = {
  id: string;
  mapName: string;
  sourceProvince: string;
  count: number;
};

type LabelDot = {
  id: string;
  x: number;
  y: number;
  value: number;
  textColor: string;
  strokeColor: string;
};

const NAME_ALIASES: Record<string, string> = {
  'dki jakarta': 'jakarta raya',
  'di yogyakarta': 'yogyakarta',
  'sumatra selatan': 'sumatera selatan',
  'sumatra utara': 'sumatera utara',
  'kep. riau': 'kepulauan riau',
  'kepulauan bangka belitung': 'bangka belitung',
};

const mapLocations = indonesiaMap.locations as Array<{ id: string; name: string; path: string }>;

function normalizeName(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toMapLookupName(v: string): string {
  const n = normalizeName(v);
  return NAME_ALIASES[n] ?? n;
}

function colorForCount(value: number, max: number): string {
  if (value <= 0) return '#e5e7eb';
  const ratio = max <= 0 ? 0 : value / max;
  if (ratio < 0.2) return '#dbeafe';
  if (ratio < 0.4) return '#bfdbfe';
  if (ratio < 0.6) return '#93c5fd';
  if (ratio < 0.8) return '#60a5fa';
  return '#1d4ed8';
}

function labelStyleForCount(value: number, max: number): { textColor: string; strokeColor: string } {
  if (value <= 0) return { textColor: '#1e3a8a', strokeColor: '#ffffff' };
  const ratio = max <= 0 ? 0 : value / max;

  // Dark text for light fills, white text for dark fills.
  if (ratio < 0.6) {
    return { textColor: '#1e3a8a', strokeColor: '#ffffff' };
  }

  return { textColor: '#ffffff', strokeColor: '#1e3a8a' };
}

export function IndonesiaDistributionMap({
  rows,
  onSelectProvince,
}: {
  rows: ProvinceRow[];
  onSelectProvince: (province: string) => void;
}) {
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const [labels, setLabels] = useState<LabelDot[]>([]);

  const mapped = useMemo(() => {
    const byMapName = new Map(
      mapLocations.map((loc) => [normalizeName(loc.name), loc]),
    );
    const items: MappedProvince[] = [];

    for (const row of rows) {
      const key = toMapLookupName(row.province);
      const loc = byMapName.get(key);
      if (!loc) continue;
      items.push({
        id: loc.id,
        mapName: loc.name,
        sourceProvince: row.province,
        count: row.totalProjects,
      });
    }

    return items;
  }, [rows]);

  const mapById = useMemo(() => {
    const m = new Map<string, MappedProvince>();
    for (const item of mapped) m.set(item.id, item);
    return m;
  }, [mapped]);

  const maxCount = useMemo(
    () => Math.max(0, ...mapped.map((m) => m.count)),
    [mapped],
  );

  useEffect(() => {
    const next: LabelDot[] = [];
    for (const item of mapped) {
      const el = pathRefs.current[item.id];
      if (!el) continue;
      const box = el.getBBox();
      const style = labelStyleForCount(item.count, maxCount);
      next.push({
        id: item.id,
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        value: item.count,
        textColor: style.textColor,
        strokeColor: style.strokeColor,
      });
    }
    setLabels(next);
  }, [mapped, maxCount]);

  return (
    <section className="bg-white rounded shadow p-4">
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <h3 className="font-semibold text-slate-800">Distribusi Project per Provinsi</h3>
          <p className="text-xs text-slate-500">
            Warna makin gelap = jumlah project makin tinggi. Klik provinsi untuk lihat detail data.
          </p>
        </div>
        <div className="text-[11px] text-slate-600 whitespace-nowrap">
          Max province: <span className="font-semibold">{maxCount}</span>
        </div>
      </div>

      <div className="rounded border bg-slate-100 overflow-x-auto">
        <svg viewBox={indonesiaMap.viewBox} className="w-full min-w-[780px] h-auto">
          {mapLocations.map((loc) => {
            const data = mapById.get(loc.id);
            const count = data?.count ?? 0;
            const fill = colorForCount(count, maxCount);

            return (
              <path
                key={loc.id}
                d={loc.path}
                fill={fill}
                stroke="#f8fafc"
                strokeWidth={0.5}
                className={data ? 'cursor-pointer hover:opacity-85' : ''}
                onClick={() => {
                  if (!data) return;
                  onSelectProvince(data.sourceProvince);
                }}
                ref={(el) => {
                  pathRefs.current[loc.id] = el;
                }}
              >
                <title>{`${loc.name}: ${count} project`}</title>
              </path>
            );
          })}

          {labels.map((label) => (
            <text
              key={label.id}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: '8px',
                fontWeight: 700,
                pointerEvents: 'none',
                fill: label.textColor,
                stroke: label.strokeColor,
                strokeWidth: 0.7,
                paintOrder: 'stroke',
              }}
            >
              {label.value}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-600">
        <span>Low</span>
        <div className="h-2 w-24 rounded" style={{ background: 'linear-gradient(90deg, #dbeafe 0%, #1d4ed8 100%)' }} />
        <span>High</span>
      </div>
    </section>
  );
}
