import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { api } from '../lib/api';

interface Site { id: string; code: string; name: string; type: string; status: string; }

export function TodayScreen({ onOpenSite }: { onOpenSite: (id: string) => void }) {
  const [sites, setSites] = useState<Site[] | null>(null);
  useEffect(() => {
    api<{ data: Site[] }>('/v1/sites?mine=1').then((r) => setSites(r.data)).catch(() => setSites([]));
  }, []);
  if (!sites) return <ActivityIndicator style={{ marginTop: 30 }} />;
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Today's sites</Text>
      <FlatList
        data={sites}
        keyExtractor={(s) => s.id}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada site untuk hari ini.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpenSite(item.id)} style={styles.card}>
            <Text style={styles.code}>{item.code}</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.type} · {item.status}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 30 },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 8, marginBottom: 10, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  code: { fontWeight: '700', fontSize: 16 },
  name: { color: '#334155' },
  meta: { color: '#64748b', fontSize: 12, marginTop: 4 },
});
