// =============================================================================
// OTDR Reading Analyzer
// -----------------------------------------------------------------------------
// Reads structured OTDR measurements (operator-entered or parsed from device
// export) and computes per-event verdicts + an overall pass/marginal/fail
// rating, following common SM-fiber acceptance thresholds (TIA-568 / G.652):
//
//   • Avg attenuation:  ≤ 0.40 dB/km @1310nm  ·  ≤ 0.25 dB/km @1550nm
//   • Splice loss (Non_refl): ≤ 0.10 dB good · ≤ 0.30 dB warn · > 0.30 fail
//   • Connector loss (Reflective): ≤ 0.50 dB; ORL ≥ 35 dB
//   • Link budget = distance × atten_target + #splices × 0.10 + #connectors × 0.50
//
// The algorithm is deterministic and side-effect-free so it is easy to test
// and re-run if thresholds change.
// =============================================================================

export type OtdrEventType = 'F_START' | 'NON_REFL' | 'REFLECTIVE' | 'F_END';

export interface OtdrEventInput {
  type: OtdrEventType;
  locationKm: number;        // distance from origin
  lossDb?: number | null;    // event loss (splice/connector loss)
  reflectanceDb?: number | null; // ORL (negative dB; less negative = worse)
  attenDbPerKm?: number | null;  // segment attenuation up to this event
}

export interface OtdrTestInput {
  wavelengthNm: 1310 | 1550 | 1625;
  pulseWidthNs: number;
  scanRangeKm: number;
  iorIndex?: number;          // index of refraction (default 1.4675)
  totalLengthKm: number;
  totalLossDb: number;
  avgLossDbPerKm?: number | null; // if omitted, derived from total/length
  events: OtdrEventInput[];
  measuredAt?: string;
  operator?: string;
}

export type EventVerdict = 'GOOD' | 'WARN' | 'FAIL';
export type OverallVerdict = 'PASS' | 'MARGINAL' | 'FAIL';

export interface AnalyzedEvent extends OtdrEventInput {
  index: number;
  verdict: EventVerdict;
  reason: string;
}

export interface OtdrAnalysis {
  wavelengthNm: number;
  totalLengthKm: number;
  totalLossDb: number;
  avgLossDbPerKm: number;
  attenuationTargetDbPerKm: number;
  linkBudgetDb: number;
  spliceCount: number;
  connectorCount: number;
  events: AnalyzedEvent[];
  overall: OverallVerdict;
  notes: string[];
}

const ATTEN_TARGET: Record<number, number> = {
  1310: 0.40,
  1550: 0.25,
  1625: 0.30,
};

const SPLICE_GOOD = 0.10;
const SPLICE_WARN = 0.30;
const CONNECTOR_LIMIT = 0.50;
const ORL_MIN_ABS = 35; // |dB|

export function analyzeOtdr(input: OtdrTestInput): OtdrAnalysis {
  const target = ATTEN_TARGET[input.wavelengthNm] ?? 0.40;
  const avgLoss = input.avgLossDbPerKm ?? (input.totalLengthKm > 0 ? input.totalLossDb / input.totalLengthKm : 0);

  const splices = input.events.filter((e) => e.type === 'NON_REFL').length;
  const connectors = input.events.filter((e) => e.type === 'REFLECTIVE').length;
  const linkBudget = input.totalLengthKm * target + splices * SPLICE_GOOD + connectors * CONNECTOR_LIMIT;

  const notes: string[] = [];
  const analyzed: AnalyzedEvent[] = input.events.map((e, i) => {
    let verdict: EventVerdict = 'GOOD';
    let reason = '';
    if (e.type === 'NON_REFL') {
      const loss = e.lossDb ?? 0;
      if (loss > SPLICE_WARN) { verdict = 'FAIL'; reason = `Splice loss ${loss.toFixed(2)} dB > ${SPLICE_WARN} dB`; }
      else if (loss > SPLICE_GOOD) { verdict = 'WARN'; reason = `Splice loss ${loss.toFixed(2)} dB > ${SPLICE_GOOD} dB`; }
      else reason = `Splice loss ${loss.toFixed(2)} dB OK`;
    } else if (e.type === 'REFLECTIVE') {
      const loss = e.lossDb ?? 0;
      const orl = e.reflectanceDb != null ? Math.abs(e.reflectanceDb) : null;
      if (loss > CONNECTOR_LIMIT) { verdict = 'FAIL'; reason = `Connector loss ${loss.toFixed(2)} dB > ${CONNECTOR_LIMIT} dB`; }
      else if (orl != null && orl < ORL_MIN_ABS) { verdict = 'WARN'; reason = `ORL |${orl.toFixed(1)}| < ${ORL_MIN_ABS} dB`; }
      else reason = `Connector OK`;
    } else if (e.type === 'F_START') {
      reason = 'Trace start';
    } else if (e.type === 'F_END') {
      reason = `Fiber end at ${e.locationKm.toFixed(3)} km`;
    }
    return { ...e, index: i + 1, verdict, reason };
  });

  // Overall verdict
  let overall: OverallVerdict = 'PASS';
  if (avgLoss > target * 1.5) {
    overall = 'FAIL';
    notes.push(`Average attenuation ${avgLoss.toFixed(3)} dB/km exceeds 1.5× target (${(target * 1.5).toFixed(3)})`);
  } else if (avgLoss > target) {
    overall = 'MARGINAL';
    notes.push(`Average attenuation ${avgLoss.toFixed(3)} dB/km exceeds target ${target.toFixed(2)} dB/km @ ${input.wavelengthNm}nm`);
  } else {
    notes.push(`Average attenuation ${avgLoss.toFixed(3)} dB/km within target ${target.toFixed(2)} dB/km`);
  }
  if (input.totalLossDb > linkBudget) {
    overall = overall === 'PASS' ? 'MARGINAL' : overall;
    notes.push(`Total loss ${input.totalLossDb.toFixed(2)} dB exceeds link budget ${linkBudget.toFixed(2)} dB`);
  }
  for (const ev of analyzed) {
    if (ev.verdict === 'FAIL') overall = 'FAIL';
    else if (ev.verdict === 'WARN' && overall === 'PASS') overall = 'MARGINAL';
  }

  return {
    wavelengthNm: input.wavelengthNm,
    totalLengthKm: input.totalLengthKm,
    totalLossDb: input.totalLossDb,
    avgLossDbPerKm: avgLoss,
    attenuationTargetDbPerKm: target,
    linkBudgetDb: linkBudget,
    spliceCount: splices,
    connectorCount: connectors,
    events: analyzed,
    overall,
    notes,
  };
}
