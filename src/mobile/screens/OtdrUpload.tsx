// =============================================================================
// OTDR Test Upload Screen — mobile
// -----------------------------------------------------------------------------
// Workflow:
//   1. Field tech photographs the OTDR device screen (camera) — quality tips shown
//   2. Manually enters OTDR measurement values (wavelength, length, loss, events)
//   3. POSTs multipart to POST /v1/fiber-projects/:id/otdr
//   4. Backend runs photo quality gate → 422 if rejected (shows failures)
//   5. On success, displays PASS / MARGINAL / FAIL verdict + per-event analysis
//
// All form defaults derive from live data (project segments, auth user) — no
// hardcoded operator names or segment labels.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, ActivityIndicator,
  StyleSheet, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { API_URL, getStoredUser } from '../lib/api';
import type { ProjectSegment } from './FiberTagging';

// ---- Types ------------------------------------------------------------------
type OtdrEventType = 'F_START' | 'NON_REFL' | 'REFLECTIVE' | 'F_END';
type EventVerdict = 'GOOD' | 'WARN' | 'FAIL';
type OverallVerdict = 'PASS' | 'MARGINAL' | 'FAIL';

interface OtdrEventInput {
  type: OtdrEventType;
  locationKm: string;   // kept as string for form binding, parsed on submit
  lossDb: string;
  reflectanceDb: string;
}

interface AnalyzedEvent {
  index: number;
  type: OtdrEventType;
  locationKm: number;
  lossDb?: number | null;
  reflectanceDb?: number | null;
  verdict: EventVerdict;
  reason: string;
}

interface OtdrAnalysis {
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

interface PhotoQualityCheck {
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
  };
}

interface OtdrTestResult {
  test: {
    id: string;
    segment: string;
    core: string;
    measuredAt: string;
    operator: string;
    analysis: OtdrAnalysis;
    photoQuality: PhotoQualityCheck | null;
    photoUrl: string | null;
  };
  project: { code: string; name: string };
  segments: Array<{
    label: string;
    txCount: number; rxCount: number;
    txPass: boolean; rxPass: boolean;
    completePct: number;
  }>;
}

// ---- Constants shared with backend analyzer (otdr-analyzer.ts) -------------
// These MUST stay in sync with the server-side ATTEN_TARGET / thresholds.
const ATTEN_TARGET: Record<number, number> = {
  1310: 0.40,
  1550: 0.25,
  1625: 0.30,
};
const SPLICE_GOOD_DB  = 0.10;
const SPLICE_WARN_DB  = 0.30;
const CONNECTOR_MAX_DB = 0.50;
const ORL_MIN_DB      = 35;  // |dB|

// ---- Wavelength display metadata --------------------------------------------
const WAVELENGTH_OPTIONS: Array<{ label: string; value: 1310 | 1550 | 1625; use: string }> = [
  { label: '1310 nm', value: 1310, use: 'Standard SM · telco access' },
  { label: '1550 nm', value: 1550, use: 'Long-haul · amplified' },
  { label: '1625 nm', value: 1625, use: 'Live-fibre monitoring' },
];

const EVENT_TYPE_OPTIONS: Array<{ label: string; value: OtdrEventType }> = [
  { label: 'Trace Start',              value: 'F_START'    },
  { label: 'Splice (Non-reflective)',  value: 'NON_REFL'   },
  { label: 'Connector (Reflective)',   value: 'REFLECTIVE' },
  { label: 'Fiber End',                value: 'F_END'      },
];

const VERDICT_COLOR: Record<OverallVerdict, string> = {
  PASS:     '#10b981',
  MARGINAL: '#f59e0b',
  FAIL:     '#f43f5e',
};

const EVENT_VERDICT_COLOR: Record<EventVerdict, string> = {
  GOOD: '#10b981',
  WARN: '#f59e0b',
  FAIL: '#f43f5e',
};

// ---- Props ------------------------------------------------------------------
interface OtdrUploadProps {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Live segment data from the project detail — drives segment picker + core auto-suggestion. */
  segments: ProjectSegment[];
  onBack: () => void;
}

// =============================================================================
export function OtdrUploadScreen({ projectId, projectCode, projectName, segments, onBack }: OtdrUploadProps) {
  // ---- Load operator from stored auth user (no hardcoded fallback) ----------
  const [operatorLoaded, setOperatorLoaded] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState('otdr.jpg');

  // ---- Derive initial segment + core from live project data ----------------
  // Pick the first segment that still needs work (not both TX+RX passed).
  // Falls back to the first segment, or empty string if no segments exist yet.
  const firstPendingSegment = useMemo(() => {
    const pending = segments.find((s) => !s.txPass || !s.rxPass);
    return (pending ?? segments[0])?.segment ?? '';
  }, [segments]);

  // For a given segment, suggest whichever core still lacks a PASS.
  function suggestCore(seg: string): 'TX' | 'RX' {
    const s = segments.find((x) => x.segment === seg);
    if (!s) return 'TX';
    if (!s.txPass) return 'TX';
    if (!s.rxPass) return 'RX';
    return 'TX'; // both passed — re-test TX
  }

  // Core metadata
  const [wavelength, setWavelength] = useState<1310 | 1550 | 1625>(1310);
  const [segment, setSegment] = useState(firstPendingSegment);
  const [core, setCore] = useState<'TX' | 'RX'>(() => suggestCore(firstPendingSegment));
  const [pulseWidthNs, setPulseWidthNs] = useState('100');
  const [scanRangeKm, setScanRangeKm] = useState('');
  const [totalLengthKm, setTotalLengthKm] = useState('');
  const [totalLossDb, setTotalLossDb] = useState('');
  const [operator, setOperator] = useState('');
  const [notes, setNotes] = useState('');

  // Load operator email from stored auth user — never default to a hardcoded string.
  useEffect(() => {
    getStoredUser().then((u) => {
      if (u?.email) setOperator(u.email);
      setOperatorLoaded(true);
    }).catch(() => setOperatorLoaded(true));
  }, []);

  // Auto-update core suggestion when segment changes.
  const handleSegmentChange = (seg: string) => {
    setSegment(seg);
    setCore(suggestCore(seg));
  };

  // ---- Live compliance preview ---------------------------------------------
  // Mirrors backend analyzeOtdr logic: avg loss vs wavelength target.
  const compliancePreview = useMemo(() => {
    const len = parseFloat(totalLengthKm);
    const loss = parseFloat(totalLossDb);
    if (isNaN(len) || len <= 0 || isNaN(loss) || loss < 0) return null;
    const avg = loss / len;
    const target = ATTEN_TARGET[wavelength];
    const spliceCount = events.filter((e) => e.type === 'NON_REFL').length;
    const connCount   = events.filter((e) => e.type === 'REFLECTIVE').length;
    const budget = len * target + spliceCount * SPLICE_GOOD_DB + connCount * CONNECTOR_MAX_DB;
    const overTarget = avg > target;
    const overBudget = loss > budget;
    return { avg, target, budget, overTarget, overBudget, spliceCount, connCount };
  }, [totalLengthKm, totalLossDb, wavelength, events]);

  // Events table
  const [events, setEvents] = useState<OtdrEventInput[]>([
    { type: 'F_START', locationKm: '0', lossDb: '', reflectanceDb: '' },
    { type: 'F_END',   locationKm: '',  lossDb: '', reflectanceDb: '' },
  ]);

  // UI state
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OtdrTestResult | null>(null);
  const [rejectionFailures, setRejectionFailures] = useState<string[] | null>(null);

  // ---- Photo capture -------------------------------------------------------
  const capturePhoto = useCallback(async (source: 'camera' | 'gallery') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Izin diperlukan', 'Akses kamera/galeri diperlukan untuk mengambil foto OTDR.');
      return;
    }
    const picked = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ exif: true, quality: 0.92, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ exif: true, quality: 0.92, allowsEditing: false, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (picked.canceled || !picked.assets?.[0]) return;
    setPhotoUri(picked.assets[0].uri);
    setPhotoFileName(picked.assets[0].fileName ?? 'otdr.jpg');
    setRejectionFailures(null);
  }, []);

  // ---- Events management --------------------------------------------------
  const addEvent = () =>
    setEvents((prev) => [...prev.slice(0, -1), { type: 'NON_REFL', locationKm: '', lossDb: '', reflectanceDb: '' }, prev[prev.length - 1]]);

  const removeEvent = (i: number) =>
    setEvents((prev) => prev.filter((_, idx) => idx !== i));

  const updateEvent = (i: number, field: keyof OtdrEventInput, val: string) =>
    setEvents((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)));

  // ---- Submit --------------------------------------------------------------
  const submit = async () => {
    if (!photoUri) { Alert.alert('Foto diperlukan', 'Ambil foto layar OTDR terlebih dahulu.'); return; }
    const totalLen = parseFloat(totalLengthKm);
    const totalLoss = parseFloat(totalLossDb);
    if (isNaN(totalLen) || totalLen <= 0) { Alert.alert('Input tidak valid', 'Total panjang serat harus diisi (km).'); return; }
    if (isNaN(totalLoss) || totalLoss < 0) { Alert.alert('Input tidak valid', 'Total rugi daya harus diisi (dB).'); return; }

    setBusy(true);
    setRejectionFailures(null);
    setResult(null);

    try {
      const payload = {
        wavelengthNm: wavelength,
        pulseWidthNs: parseFloat(pulseWidthNs) || 100,
        scanRangeKm: parseFloat(scanRangeKm) || totalLen * 1.2,
        totalLengthKm: totalLen,
        totalLossDb: totalLoss,
        measuredAt: new Date().toISOString(),
        operator: operator.trim() || undefined,   // undefined → server keeps its own default
        events: events.map((e) => ({
          type: e.type,
          locationKm: parseFloat(e.locationKm) || 0,
          lossDb: e.lossDb ? parseFloat(e.lossDb) : null,
          reflectanceDb: e.reflectanceDb ? parseFloat(e.reflectanceDb) : null,
        })),
      };

      const fd = new FormData();
      // @ts-expect-error — RN FormData accepts {uri, name, type}
      fd.append('photo', { uri: photoUri, name: photoFileName, type: 'image/jpeg' });
      fd.append('payload', JSON.stringify(payload));
      fd.append('segment', segment.trim() || firstPendingSegment || 'A-B');
      fd.append('core', core);
      fd.append('operator', operator.trim());
      fd.append('notes', notes);

      const res = await fetch(`${API_URL}/v1/fiber-projects/${projectId}/otdr`, { method: 'POST', body: fd });
      const json = await res.json() as Record<string, unknown>;

      if (res.status === 422 && json.code === 'OTDR_PHOTO_REJECTED') {
        setRejectionFailures((json.failures as string[]) ?? ['Foto ditolak — tidak memenuhi syarat.']);
      } else if (!res.ok) {
        Alert.alert('Upload gagal', (json.detail as string) ?? (json.code as string) ?? `HTTP ${res.status}`);
      } else {
        setResult(json as unknown as OtdrTestResult);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setBusy(false);
    }
  };

  // ---- Result view ---------------------------------------------------------
  if (result) {
    return <ResultView result={result} onNewTest={() => setResult(null)} onBack={onBack} />;
  }

  // ---- Form ----------------------------------------------------------------
  return (
    <ScrollView style={styles.root} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <Pressable onPress={onBack}><Text style={styles.back}>← Kembali</Text></Pressable>
      <Text style={styles.title}>Upload OTDR</Text>
      <Text style={styles.meta}>{projectCode} · {projectName}</Text>

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 1: Photo capture                                           */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader label="1. Foto Layar OTDR" />
      <View style={styles.qualityTips}>
        <Text style={styles.tipsTitle}>📸 Tips kualitas foto:</Text>
        {[
          'Foto langsung dari layar perangkat OTDR (bukan screenshot)',
          'Resolusi minimal 1024×768 — gunakan kamera belakang',
          'Hindari pantulan / glare pada layar',
          'Pastikan seluruh layar OTDR terambil (portrait/landscape)',
          'Timestamp EXIF akan dipakai sebagai bukti waktu pengukuran',
        ].map((t) => <Text key={t} style={styles.tipItem}>• {t}</Text>)}
      </View>

      {photoUri ? (
        <View style={{ marginBottom: 12 }}>
          <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />
          <Pressable onPress={() => setPhotoUri(null)} style={styles.btnRemove}>
            <Text style={styles.btnRemoveText}>✕ Hapus foto</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.photoRow}>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => void capturePhoto('camera')}>
            <Text style={styles.btnText}>📷 Kamera</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => void capturePhoto('gallery')}>
            <Text style={styles.btnText}>🖼 Galeri</Text>
          </Pressable>
        </View>
      )}

      {/* Rejection feedback */}
      {rejectionFailures && (
        <View style={styles.rejectionBox}>
          <Text style={styles.rejectionTitle}>⛔ Foto ditolak — ambil ulang:</Text>
          {rejectionFailures.map((f) => <Text key={f} style={styles.rejectionItem}>• {f}</Text>)}
        </View>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 2: Test parameters                                         */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader label="2. Parameter Pengukuran" />

      <Label>Wavelength</Label>
      <View style={styles.chipRow}>
        {WAVELENGTH_OPTIONS.map((w) => (
          <Pressable
            key={w.value}
            style={[styles.chip, wavelength === w.value && styles.chipActive]}
            onPress={() => setWavelength(w.value)}
          >
            <Text style={[styles.chipText, wavelength === w.value && styles.chipTextActive]}>{w.label}</Text>
          </Pressable>
        ))}
      </View>
      {/* Threshold reference card — derived from shared constants, not hardcoded strings */}
      <View style={styles.thresholdCard}>
        <Text style={styles.thresholdTitle}>Batas penerimaan untuk {wavelength} nm:</Text>
        <Text style={styles.thresholdItem}>• Atenuasi maks: <Text style={styles.thresholdVal}>{ATTEN_TARGET[wavelength]} dB/km</Text></Text>
        <Text style={styles.thresholdItem}>• Loss splice: GOOD ≤ {SPLICE_GOOD_DB} · WARN ≤ {SPLICE_WARN_DB} · FAIL &gt; {SPLICE_WARN_DB} dB</Text>
        <Text style={styles.thresholdItem}>• Loss konektor: maks {CONNECTOR_MAX_DB} dB · ORL ≥ {ORL_MIN_DB} dB</Text>
      </View>

      {/* Segment picker from real project segments */}
      <Label>Segment</Label>
      {segments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {segments.map((s) => {
              const done = s.txPass && s.rxPass;
              const partial = s.txPass !== s.rxPass;
              return (
                <Pressable
                  key={s.segment}
                  style={[styles.chip, segment === s.segment && styles.chipActive, done && styles.chipDone]}
                  onPress={() => handleSegmentChange(s.segment)}
                >
                  <Text style={[styles.chipText, segment === s.segment && styles.chipTextActive]}>
                    {s.segment} {done ? '✓' : partial ? '½' : '○'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        /* No segments yet in the project — allow free-text entry */
        <TextInput style={styles.input} value={segment} onChangeText={handleSegmentChange} placeholder="mis. A-B" />
      )}

      {/* Core — auto-suggested based on which core still needs a PASS for the selected segment */}
      <Label>Core {(() => {
        const s = segments.find((x) => x.segment === segment);
        if (!s) return '';
        return s.txPass && !s.rxPass ? '(RX disarankan — TX sudah PASS)'
          : !s.txPass && s.rxPass ? '(TX disarankan — RX sudah PASS)'
          : !s.txPass && !s.rxPass ? '(mulai dari TX)'
          : '(keduanya sudah PASS — re-test)';
      })()}</Label>
      <View style={styles.chipRow}>
        {(['TX', 'RX'] as const).map((c) => (
          <Pressable key={c} style={[styles.chip, core === c && styles.chipActive]} onPress={() => setCore(c)}>
            <Text style={[styles.chipText, core === c && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <Label>Segment (mis. A-B)</Label>
      <TextInput style={styles.input} value={segment} onChangeText={handleSegmentChange} placeholder="A-B" />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Label>Panjang Total (km)</Label>
          <TextInput style={styles.input} value={totalLengthKm} onChangeText={setTotalLengthKm} keyboardType="decimal-pad" placeholder="mis. 12.5" />
        </View>
        <View style={{ width: 8 }} />
        <View style={{ flex: 1 }}>
          <Label>Total Loss (dB)</Label>
          <TextInput style={styles.input} value={totalLossDb} onChangeText={setTotalLossDb} keyboardType="decimal-pad" placeholder="mis. 4.2" />
        </View>
      </View>

      {/* Live compliance preview — same thresholds as backend analyzer */}
      {compliancePreview && (
        <View style={[styles.complianceCard, compliancePreview.overTarget || compliancePreview.overBudget ? styles.complianceFail : styles.compliancePass]}>
          <Text style={styles.complianceTitle}>
            {compliancePreview.overTarget || compliancePreview.overBudget ? '⚠ Prakiraan: TIDAK LOLOS' : '✓ Prakiraan: LOLOS'}
          </Text>
          <Text style={styles.complianceItem}>
            Avg loss: <Text style={compliancePreview.overTarget ? styles.red : styles.green}>{compliancePreview.avg.toFixed(3)} dB/km</Text>
            {' '}(batas: {compliancePreview.target} dB/km)
          </Text>
          <Text style={styles.complianceItem}>
            Link budget: {compliancePreview.budget.toFixed(2)} dB
            {' '}· Total loss: <Text style={compliancePreview.overBudget ? styles.red : styles.green}>{parseFloat(totalLossDb).toFixed(2)} dB</Text>
          </Text>
          <Text style={styles.complianceItem}>
            {compliancePreview.spliceCount} splice · {compliancePreview.connCount} konektor terdeteksi dari events
          </Text>
        </View>
      )}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Label>Pulse Width (ns)</Label>
          <TextInput style={styles.input} value={pulseWidthNs} onChangeText={setPulseWidthNs} keyboardType="decimal-pad" placeholder="100" />
        </View>
        <View style={{ width: 8 }} />
        <View style={{ flex: 1 }}>
          <Label>Scan Range (km)</Label>
          <TextInput style={styles.input} value={scanRangeKm} onChangeText={setScanRangeKm} keyboardType="decimal-pad" placeholder="auto" />
        </View>
      </View>

      <Label>Operator</Label>
      <TextInput style={styles.input} value={operator} onChangeText={setOperator} placeholder="nama.teknisi@perusahaan.com" autoCapitalize="none" />

      <Label>Catatan</Label>
      <TextInput style={[styles.input, { height: 72, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} placeholder="Keterangan tambahan…" multiline />

      {/* ------------------------------------------------------------------ */}
      {/* SECTION 3: Events table                                            */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader label="3. Event Table (dari layar OTDR)" />
      <Text style={styles.hint}>Masukkan setiap event dari tabel OTDR. F_START dan F_END sudah ada secara default.</Text>

      {events.map((e, i) => (
        <View key={i} style={styles.eventCard}>
          <View style={styles.eventHeader}>
            <Text style={styles.eventIdx}>#{i + 1}</Text>
            {/* Type selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[styles.chip, styles.chipSmall, e.type === opt.value && styles.chipActive]}
                    onPress={() => updateEvent(i, 'type', opt.value)}
                  >
                    <Text style={[styles.chipText, styles.chipTextSmall, e.type === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            {events.length > 2 && i !== 0 && i !== events.length - 1 && (
              <Pressable onPress={() => removeEvent(i)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Label>Lokasi (km)</Label>
              <TextInput
                style={styles.inputSm}
                value={e.locationKm}
                onChangeText={(v) => updateEvent(i, 'locationKm', v)}
                keyboardType="decimal-pad"
                placeholder="0.000"
              />
            </View>
            {(e.type === 'NON_REFL' || e.type === 'REFLECTIVE') && (
              <>
                <View style={{ width: 6 }} />
                <View style={{ flex: 1 }}>
                  <Label>Loss (dB)</Label>
                  <TextInput
                    style={styles.inputSm}
                    value={e.lossDb}
                    onChangeText={(v) => updateEvent(i, 'lossDb', v)}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
              </>
            )}
            {e.type === 'REFLECTIVE' && (
              <>
                <View style={{ width: 6 }} />
                <View style={{ flex: 1 }}>
                  <Label>ORL (dB)</Label>
                  <TextInput
                    style={styles.inputSm}
                    value={e.reflectanceDb}
                    onChangeText={(v) => updateEvent(i, 'reflectanceDb', v)}
                    keyboardType="decimal-pad"
                    placeholder="-35"
                  />
                </View>
              </>
            )}
          </View>
        </View>
      ))}

      <Pressable style={[styles.btn, styles.btnGhost]} onPress={addEvent}>
        <Text style={styles.btnGhostText}>+ Tambah Event</Text>
      </Pressable>

      {/* ------------------------------------------------------------------ */}
      {/* Submit                                                              */}
      {/* ------------------------------------------------------------------ */}
      <View style={{ height: 16 }} />
      <Pressable
        style={[styles.btn, styles.btnSubmit, busy && styles.btnDisabled]}
        onPress={() => void submit()}
        disabled={busy}
      >
        {busy
          ? <ActivityIndicator color="white" />
          : <Text style={styles.btnText}>📤 Upload & Analisa OTDR</Text>
        }
      </Pressable>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// =============================================================================
// Result screen
// =============================================================================
function ResultView({ result, onNewTest, onBack }: { result: OtdrTestResult; onNewTest: () => void; onBack: () => void }) {
  const { test } = result;
  const a = test.analysis;
  const verdictColor = VERDICT_COLOR[a.overall];

  return (
    <ScrollView style={styles.root}>
      <Pressable onPress={onBack}><Text style={styles.back}>← Kembali ke Fiber</Text></Pressable>

      {/* Verdict banner */}
      <View style={[styles.verdictBanner, { borderColor: verdictColor }]}>
        <Text style={[styles.verdictLabel, { color: verdictColor }]}>{a.overall}</Text>
        <Text style={styles.verdictSub}>{test.segment} · Core {test.core} · {a.wavelengthNm} nm</Text>
        <Text style={styles.verdictSub}>{new Date(test.measuredAt).toLocaleString('id-ID')}</Text>
      </View>

      {/* Key metrics */}
      <View style={styles.metricsRow}>
        <Metric label="Panjang" value={`${a.totalLengthKm.toFixed(3)} km`} />
        <Metric label="Total Loss" value={`${a.totalLossDb.toFixed(2)} dB`} />
        <Metric label="Avg Loss" value={`${a.avgLossDbPerKm.toFixed(3)} dB/km`} />
        <Metric label="Budget" value={`${a.linkBudgetDb.toFixed(2)} dB`} />
      </View>
      <View style={styles.metricsRow}>
        <Metric label="Splices" value={String(a.spliceCount)} />
        <Metric label="Connectors" value={String(a.connectorCount)} />
        <Metric label="Target" value={`${a.attenuationTargetDbPerKm} dB/km`} />
      </View>

      {/* Notes from engine */}
      {a.notes.length > 0 && (
        <View style={styles.notesBox}>
          {a.notes.map((n) => <Text key={n} style={styles.noteItem}>ℹ {n}</Text>)}
        </View>
      )}

      {/* Photo quality */}
      {test.photoQuality && (
        <View style={[styles.qualityBox, { borderColor: test.photoQuality.ok ? '#10b981' : '#f43f5e' }]}>
          <Text style={styles.qualitySectionTitle}>
            {test.photoQuality.ok ? '✅ Kualitas Foto: OK' : '⚠ Kualitas Foto: Masalah Terdeteksi'}
          </Text>
          {test.photoQuality.failures.map((f) => <Text key={f} style={styles.qualityFailure}>• {f}</Text>)}
          <Text style={styles.qualityMeta}>
            {test.photoQuality.meta.make} {test.photoQuality.meta.model}
            {test.photoQuality.meta.width && ` · ${test.photoQuality.meta.width}×${test.photoQuality.meta.height}`}
            {test.photoQuality.meta.capturedAt && ` · ${new Date(test.photoQuality.meta.capturedAt).toLocaleString('id-ID')}`}
          </Text>
        </View>
      )}

      {/* Evidence photo */}
      {test.photoUrl && (
        <Image
          source={{ uri: `${API_URL}${test.photoUrl}` }}
          style={styles.evidencePhoto}
          resizeMode="contain"
        />
      )}

      {/* Per-event analysis */}
      <Text style={styles.sectionTitle}>Analisa Per-Event</Text>
      <View style={styles.eventsTable}>
        <View style={[styles.eventsRow, styles.eventsHead]}>
          <Text style={[styles.evCol, styles.evColIdx]}>#</Text>
          <Text style={[styles.evCol, styles.evColType]}>Tipe</Text>
          <Text style={[styles.evCol, styles.evColKm]}>Km</Text>
          <Text style={[styles.evCol, styles.evColLoss]}>Loss</Text>
          <Text style={[styles.evCol, styles.evColVerdict]}>Status</Text>
        </View>
        {a.events.map((ev) => (
          <View key={ev.index} style={styles.eventsRow}>
            <Text style={[styles.evCol, styles.evColIdx]}>{ev.index + 1}</Text>
            <Text style={[styles.evCol, styles.evColType]}>{ev.type}</Text>
            <Text style={[styles.evCol, styles.evColKm]}>{ev.locationKm.toFixed(3)}</Text>
            <Text style={[styles.evCol, styles.evColLoss]}>{ev.lossDb != null ? `${ev.lossDb.toFixed(2)} dB` : '—'}</Text>
            <View style={[styles.evCol, styles.evColVerdict]}>
              <Text style={[styles.verdictPill, { backgroundColor: EVENT_VERDICT_COLOR[ev.verdict] }]}>{ev.verdict}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Event reasons */}
      {a.events.filter((e) => e.reason).map((ev) => (
        <Text key={ev.index} style={styles.reasonItem}>
          Event {ev.index + 1}: {ev.reason}
        </Text>
      ))}

      <Pressable style={[styles.btn, styles.btnPrimary, { marginTop: 20 }]} onPress={onNewTest}>
        <Text style={styles.btnText}>+ Upload OTDR Baru</Text>
      </Pressable>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ---- Small helpers ----------------------------------------------------------
function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}
function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

// =============================================================================
// Styles
// =============================================================================
const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  back: { color: '#0284c7', fontSize: 13, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  meta: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  hint: { color: '#64748b', fontSize: 12, marginBottom: 8 },

  // Tips
  qualityTips: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, padding: 10, marginBottom: 12 },
  tipsTitle: { fontWeight: '600', fontSize: 12, color: '#166534', marginBottom: 4 },
  tipItem: { fontSize: 11, color: '#15803d', lineHeight: 18 },

  // Threshold reference card
  thresholdCard: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, padding: 10, marginBottom: 10 },
  thresholdTitle: { fontWeight: '600', fontSize: 11, color: '#1d4ed8', marginBottom: 3 },
  thresholdItem: { fontSize: 11, color: '#1e40af', lineHeight: 17 },
  thresholdVal: { fontWeight: '700' },

  // Compliance preview
  complianceCard: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  compliancePass: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  complianceFail: { backgroundColor: '#fff1f2', borderColor: '#fca5a5' },
  complianceTitle: { fontWeight: '700', fontSize: 13, marginBottom: 4 },
  complianceItem: { fontSize: 12, lineHeight: 18, color: '#374151' },
  green: { color: '#15803d', fontWeight: '700' },
  red: { color: '#dc2626', fontWeight: '700' },

  // Photo
  preview: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#1e293b', marginBottom: 6 },
  photoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  btnRemove: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4 },
  btnRemoveText: { color: '#ef4444', fontSize: 13 },

  // Rejection
  rejectionBox: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderRadius: 8, padding: 10, marginBottom: 12 },
  rejectionTitle: { fontWeight: '700', color: '#be123c', marginBottom: 4 },
  rejectionItem: { fontSize: 12, color: '#9f1239', lineHeight: 18 },

  // Inputs
  sectionTitle: { fontWeight: '700', fontSize: 14, marginTop: 16, marginBottom: 8, color: '#0f172a' },
  label: { fontSize: 11, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10, backgroundColor: 'white', fontSize: 13 },
  inputSm: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'white', fontSize: 12 },
  row: { flexDirection: 'row', marginBottom: 4 },

  // Chips
  chipRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: 'white' },
  chipSmall: { paddingHorizontal: 7, paddingVertical: 4 },
  chipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  chipDone: { borderColor: '#10b981', backgroundColor: '#f0fdf4' },
  chipText: { fontSize: 13, color: '#334155' },
  chipTextSmall: { fontSize: 11 },
  chipTextActive: { color: 'white', fontWeight: '600' },

  // Events
  eventCard: { backgroundColor: 'white', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  eventIdx: { fontWeight: '700', color: '#475569', minWidth: 24 },
  removeBtn: { padding: 4 },
  removeBtnText: { color: '#ef4444', fontSize: 16 },

  // Buttons
  btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnPrimary: { backgroundColor: '#0f172a' },
  btnSecondary: { backgroundColor: '#475569' },
  btnGhost: { borderWidth: 1, borderColor: '#0284c7', backgroundColor: 'white', marginBottom: 4, flex: 0 },
  btnGhostText: { color: '#0284c7', fontWeight: '600', fontSize: 13 },
  btnSubmit: { backgroundColor: '#0284c7', flex: 0 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'white', fontWeight: '600', fontSize: 14 },

  // Result
  verdictBanner: { borderWidth: 3, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  verdictLabel: { fontSize: 36, fontWeight: '800', letterSpacing: 2 },
  verdictSub: { color: '#475569', fontSize: 12, marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  metric: { flex: 1, backgroundColor: 'white', borderRadius: 6, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  metricLabel: { fontSize: 10, color: '#64748b', textTransform: 'uppercase' },
  metricValue: { fontWeight: '700', fontSize: 13, marginTop: 2 },
  notesBox: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, padding: 10, marginBottom: 10 },
  noteItem: { fontSize: 12, color: '#92400e', lineHeight: 18 },
  qualityBox: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  qualitySectionTitle: { fontWeight: '600', fontSize: 13, marginBottom: 4 },
  qualityFailure: { fontSize: 12, color: '#dc2626', lineHeight: 18 },
  qualityMeta: { fontSize: 11, color: '#64748b', marginTop: 4 },
  evidencePhoto: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#1e293b', marginBottom: 12 },

  // Events table
  eventsTable: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 8 },
  eventsRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8 },
  eventsHead: { backgroundColor: '#f1f5f9' },
  evCol: { fontSize: 11, color: '#334155' },
  evColIdx: { width: 24, fontWeight: '700' },
  evColType: { flex: 2, fontFamily: 'monospace' },
  evColKm: { flex: 1, textAlign: 'right', fontFamily: 'monospace' },
  evColLoss: { flex: 1, textAlign: 'right', fontFamily: 'monospace' },
  evColVerdict: { flex: 1, alignItems: 'flex-end' },
  verdictPill: { fontSize: 10, fontWeight: '700', color: 'white', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  reasonItem: { fontSize: 11, color: '#64748b', lineHeight: 17, marginBottom: 2 },
});
