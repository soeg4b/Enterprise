import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { api, clearTokens } from '../lib/api';

interface Me { fullName: string; email: string; role: string; }

export function ProfileScreen({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>('/v1/me').then(setMe).catch(() => undefined); }, []);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Saya</Text>
      {me && (
        <>
          <Text style={styles.name}>{me.fullName}</Text>
          <Text style={styles.meta}>{me.email}</Text>
          <Text style={styles.meta}>Role: {me.role}</Text>
        </>
      )}
      <Pressable onPress={async () => { await clearTokens(); onLogout(); }} style={styles.btn}>
        <Text style={styles.btnText}>LOGOUT</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#64748b', marginTop: 2 },
  btn: { backgroundColor: '#dc2626', padding: 14, borderRadius: 6, alignItems: 'center', marginTop: 24 },
  btnText: { color: 'white', fontWeight: '700' },
});
