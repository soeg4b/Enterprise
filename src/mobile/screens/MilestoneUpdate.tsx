import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { queueOutbox } from '../lib/db';
import { pushOutbox } from '../lib/sync';

const STATUSES = ['IN_PROGRESS', 'DONE', 'BLOCKED'] as const;

export function MilestoneUpdateScreen({ milestoneId, onDone }: { milestoneId: string; onDone: () => void }) {
  const [status, setStatus] = useState<typeof STATUSES[number]>('IN_PROGRESS');
  const [actualDate, setActualDate] = useState(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await queueOutbox('Milestone', 'UPSERT', {
        milestoneId,
        status,
        actualDate: status === 'DONE' ? actualDate : null,
        remark: remark || undefined,
      });
      // Best-effort immediate push; failures stay in outbox.
      try { await pushOutbox(); } catch { /* offline ok */ }
      Alert.alert('Saved', 'Update queued and pushed when online.');
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Update Milestone</Text>
      <Text style={styles.label}>Status</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {STATUSES.map((s) => (
          <Pressable key={s} onPress={() => setStatus(s)}
            style={[styles.chip, status === s && styles.chipActive]}>
            <Text style={status === s ? styles.chipTextActive : styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>
      {status === 'DONE' && (
        <>
          <Text style={styles.label}>Actual date (YYYY-MM-DD)</Text>
          <TextInput value={actualDate} onChangeText={setActualDate} style={styles.input} />
        </>
      )}
      <Text style={styles.label}>Remark</Text>
      <TextInput value={remark} onChangeText={setRemark} style={[styles.input, { minHeight: 80 }]} multiline />
      <Pressable onPress={submit} disabled={busy} style={[styles.btn, busy && { opacity: 0.6 }]}>
        <Text style={styles.btnText}>{busy ? 'Saving…' : 'SAVE & SYNC'}</Text>
      </Pressable>
      <Text style={styles.hint}>Photo capture (expo-image-picker) and geotag (expo-location) wiring is scaffolded — see roadmap.</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 12, color: '#475569', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, padding: 10, marginBottom: 12, backgroundColor: 'white' },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  chipText: { color: '#0f172a', fontSize: 12 },
  chipTextActive: { color: 'white', fontSize: 12 },
  btn: { backgroundColor: '#0f172a', padding: 14, borderRadius: 6, alignItems: 'center', marginTop: 8 },
  btnText: { color: 'white', fontWeight: '700' },
  hint: { fontSize: 11, color: '#64748b', marginTop: 16, textAlign: 'center' },
});
