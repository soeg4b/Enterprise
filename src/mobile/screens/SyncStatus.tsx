import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { pendingOutbox } from '../lib/db';
import { pullDelta, pushOutbox } from '../lib/sync';

export function SyncStatusScreen() {
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const refresh = async () => setPending((await pendingOutbox()).length);
  useEffect(() => { void refresh(); }, []);

  async function syncNow() {
    setBusy(true);
    try {
      const pull = await pullDelta();
      const push = await pushOutbox();
      setLast(`Pulled ${pull.count}, pushed ${push.sent}, rejected ${push.rejected}`);
      await refresh();
    } catch (e) {
      Alert.alert('Sync failed', e instanceof Error ? e.message : 'Unknown error');
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Sync</Text>
      <Text>Pending outbox items: <Text style={{ fontWeight: '700' }}>{pending}</Text></Text>
      {last && <Text style={{ color: '#475569', marginTop: 8 }}>{last}</Text>}
      <Pressable onPress={syncNow} disabled={busy} style={[styles.btn, busy && { opacity: 0.6 }]}>
        <Text style={styles.btnText}>{busy ? 'Syncing…' : 'SYNC NOW'}</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  btn: { backgroundColor: '#0f172a', padding: 14, borderRadius: 6, alignItems: 'center', marginTop: 16 },
  btnText: { color: 'white', fontWeight: '700' },
});
