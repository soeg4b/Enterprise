import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { api, setTokens } from '../lib/api';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('field1@deliveriq.local');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const res = await api<{ accessToken: string; refreshToken: string }>(
        '/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), auth: false },
      );
      await setTokens(res.accessToken, res.refreshToken);
      onLoggedIn();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Login failed'); }
    finally { setBusy(false); }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>PDC Enterprise Field</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" style={styles.input} />
      <TextInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry style={styles.input} />
      {err && <Text style={styles.err}>{err}</Text>}
      <Pressable onPress={submit} disabled={busy} style={[styles.btn, busy && { opacity: 0.6 }]}>
        <Text style={styles.btnText}>{busy ? 'Memproses…' : 'MASUK'}</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, padding: 12, marginBottom: 12, backgroundColor: 'white' },
  btn: { backgroundColor: '#0f172a', padding: 14, borderRadius: 6, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '700' },
  err: { color: '#dc2626', marginBottom: 12 },
});
