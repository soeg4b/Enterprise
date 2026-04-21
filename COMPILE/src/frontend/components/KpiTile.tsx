type Tone = 'default' | 'ontrack' | 'atrisk' | 'delay';

const TONE_BG: Record<Tone, string> = {
  default: 'bg-white',
  ontrack: 'bg-emerald-50 border-emerald-200',
  atrisk: 'bg-amber-50 border-amber-200',
  delay: 'bg-red-50 border-red-200',
};

export function KpiTile({ label, value, tone = 'default' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={`rounded shadow p-4 border ${TONE_BG[tone]}`}>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
