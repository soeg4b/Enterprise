import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { api } from '../lib/api';

interface Milestone { id: string; seq: number; type: string; status: string; planDate: string | null; actualDate: string | null; overdueDays: number; }
interface Site { id: string; code: string; name: string; milestones: Milestone[]; }

export function SiteDetailScreen({ siteId, onOpenMilestone, onBack }: {
  siteId: string;
  onOpenMilestone: (milestoneId: string) => void;
  onBack: () => void;
}) {
  const [site, setSite] = useState<Site | null>(null);
  useEffect(() => { api<Site>(`/v1/sites/${siteId}`).then(setSite).catch(() => undefined); }, [siteId]);
  if (!site) return <ActivityIndicator style={{ marginTop: 30 }} />;
  return (
    <View style={styles.root}>
      <Pressable onPress={onBack}><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.title}>{site.code} — {site.name}</Text>
      <FlatList
        data={[...site.milestones].sort((a, b) => a.seq - b.seq)}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpenMilestone(item.id)} style={styles.row}>
            <Text style={styles.seq}>{item.seq}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.type}</Text>
              <Text style={styles.meta}>
                Plan {item.planDate ?? '—'}{item.actualDate ? ` · Actual ${item.actualDate}` : ''}
                {item.overdueDays > 0 ? ` · OVERDUE ${item.overdueDays}d` : ''}
              </Text>
            </View>
            <Text style={styles.status}>{item.status}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  back: { color: '#0369a1', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 8 },
  seq: { width: 24, textAlign: 'center', fontWeight: '700' },
  name: { fontWeight: '600' },
  meta: { color: '#64748b', fontSize: 12 },
  status: { fontSize: 11, color: '#0f172a', backgroundColor: '#e2e8f0', padding: 4, borderRadius: 4 },
});
