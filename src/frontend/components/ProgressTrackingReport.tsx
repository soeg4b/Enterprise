'use client';

import Link from 'next/link';

type ProgressTrackingReportProps = {
  title: string;
  reportDate: string;
  targetDate: string;
  progressPct: number;
  detailHref?: string;
};

type TrackingSeries = {
  labels: string[];
  isolatedPlan: number[];
  isolatedForecast: number[];
  isolatedActual: number[];
  cumulativePlan: number[];
  cumulativeForecast: number[];
  cumulativeActual: number[];
};

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function buildWeekLabels(count: number): string[] {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 14);
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i * 7);
    labels.push(`W${isoWeek(dt)}`);
  }
  return labels;
}

function cumulativeFromIsolated(values: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const v of values) {
    acc += v;
    out.push(Number(acc.toFixed(2)));
  }
  return out;
}

function diffToIsolated(cumulative: number[]): number[] {
  return cumulative.map((v, i) => Number((v - (cumulative[i - 1] ?? 0)).toFixed(2)));
}

function buildSeries(progressPct: number): TrackingSeries {
  const isolatedPlan = [1, 3, 5, 10, 20, 35, 16, 7, 3];
  const labels = buildWeekLabels(isolatedPlan.length);
  const cumulativePlan = cumulativeFromIsolated(isolatedPlan);

  const boundedProgress = Math.max(0, Math.min(100, Number(progressPct || 0)));
  const cumulativeActual = cumulativePlan.map((v) => Number(Math.min(v, boundedProgress).toFixed(2)));
  const isolatedActual = diffToIsolated(cumulativeActual);

  const zeroes = new Array(isolatedPlan.length).fill(0);

  return {
    labels,
    isolatedPlan,
    isolatedForecast: zeroes,
    isolatedActual,
    cumulativePlan,
    cumulativeForecast: zeroes,
    cumulativeActual,
  };
}

function maxNum(values: number[]): number {
  return Math.max(0, ...values);
}

export function ProgressTrackingReport({
  title,
  reportDate,
  targetDate,
  progressPct,
  detailHref,
}: ProgressTrackingReportProps) {
  const series = buildSeries(progressPct);
  const leftMax = Math.max(40, Math.ceil(maxNum(series.isolatedPlan) / 5) * 5);
  const rightMax = 120;

  const chartW = 1040;
  const chartH = 300;
  const leftPad = 56;
  const rightPad = 54;
  const topPad = 12;
  const bottomPad = 36;
  const innerW = chartW - leftPad - rightPad;
  const innerH = chartH - topPad - bottomPad;
  const stepX = innerW / Math.max(1, series.labels.length - 1);
  const barW = Math.min(30, stepX * 0.42);

  const yLeft = (v: number) => topPad + innerH - (v / leftMax) * innerH;
  const yRight = (v: number) => topPad + innerH - (v / rightMax) * innerH;
  const xAt = (idx: number) => leftPad + idx * stepX;

  const planLine = series.cumulativePlan
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yRight(v)}`)
    .join(' ');
  const forecastLine = series.cumulativeForecast
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yRight(v)}`)
    .join(' ');
  const actualLine = series.cumulativeActual
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yRight(v)}`)
    .join(' ');

  const legend = [
    { label: 'ISOLATED PLAN', color: '#5b5b5b' },
    { label: 'ISOLATED FORECAST', color: '#ed7d31' },
    { label: 'ISOLATED ACTUAL', color: '#0b2f75' },
    { label: 'CUMMULATIVE PLAN', color: '#7a7a7a' },
    { label: 'CUMMULATIVE FORECAST', color: '#f4a261' },
    { label: 'CUMMULATIVEACTUAL', color: '#86b8e7' },
  ];

  return (
    <section className="bg-white rounded border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <div><span className="font-semibold">Progress Report Date:</span> {reportDate}</div>
          <div><span className="font-semibold">RFS Target Date:</span> {targetDate}</div>
        </div>
        {detailHref && (
          <Link
            href={detailHref}
            className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-slate-50 text-blue-700"
          >
            Open Detail
          </Link>
        )}
      </div>

      <h3 className="text-2xl font-bold text-center text-slate-700">{title}</h3>

      <div className="border rounded bg-slate-50 overflow-x-auto">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-[920px] h-auto">
          {[0, 5, 10, 15, 20, 25, 30, 35, 40].map((tick) => {
            const y = yLeft(tick);
            return (
              <g key={`l-${tick}`}>
                <line x1={leftPad} y1={y} x2={chartW - rightPad} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                <text x={leftPad - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">{tick.toFixed(2)}%</text>
              </g>
            );
          })}

          {[0, 20, 40, 60, 80, 100, 120].map((tick) => {
            const y = yRight(tick);
            return (
              <text key={`r-${tick}`} x={chartW - rightPad + 8} y={y + 4} fontSize="11" fill="#64748b">{tick.toFixed(2)}%</text>
            );
          })}

          {series.isolatedPlan.map((v, i) => {
            const x = xAt(i) - barW / 2;
            const y = yLeft(v);
            const h = topPad + innerH - y;
            return (
              <rect key={`bar-${i}`} x={x} y={y} width={barW} height={h} fill="#5b5b5b" />
            );
          })}

          <path d={planLine} fill="none" stroke="#7a7a7a" strokeWidth="3" />
          {series.cumulativePlan.map((v, i) => (
            <circle key={`pc-${i}`} cx={xAt(i)} cy={yRight(v)} r="6" fill="#f8fafc" stroke="#7a7a7a" strokeWidth="2" />
          ))}

          <path d={forecastLine} fill="none" stroke="#f4a261" strokeWidth="2" />
          <path d={actualLine} fill="none" stroke="#86b8e7" strokeWidth="2" />
          {series.cumulativeActual.map((v, i) => (
            <circle key={`ac-${i}`} cx={xAt(i)} cy={yRight(v)} r="5" fill="#e2f3ff" stroke="#7cb342" strokeWidth="2" />
          ))}

          {series.labels.map((w, i) => (
            <text key={w} x={xAt(i)} y={chartH - 10} textAnchor="middle" fontSize="12" fill="#64748b">{w}</text>
          ))}
        </svg>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-xs">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left w-48">Metric</th>
              {series.labels.map((w) => (
                <th key={`h-${w}`} className="p-2 text-right font-mono">{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TrackingRow label="ISOLATED PLAN" color="#5b5b5b" values={series.isolatedPlan} />
            <TrackingRow label="ISOLATED FORECAST" color="#ed7d31" values={series.isolatedForecast} />
            <TrackingRow label="ISOLATED ACTUAL" color="#0b2f75" values={series.isolatedActual} />
            <TrackingRow label="CUMMULATIVE PLAN" color="#7a7a7a" values={series.cumulativePlan} />
            <TrackingRow label="CUMMULATIVE FORECAST" color="#f4a261" values={series.cumulativeForecast} />
            <TrackingRow label="CUMMULATIVEACTUAL" color="#86b8e7" values={series.cumulativeActual} />
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        {legend.map((l) => (
          <div key={l.label} className="inline-flex items-center gap-1.5">
            <span className="w-6 h-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrackingRow({
  label,
  color,
  values,
}: {
  label: string;
  color: string;
  values: number[];
}) {
  return (
    <tr className="border-t">
      <td className="p-2">
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
          {label}
        </span>
      </td>
      {values.map((v, idx) => (
        <td key={`${label}-${idx}`} className="p-2 text-right font-mono">{v.toFixed(2)}%</td>
      ))}
    </tr>
  );
}
