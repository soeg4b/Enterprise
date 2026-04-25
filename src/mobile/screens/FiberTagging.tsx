// Mobile screen: Fiber Optic project tagging.
// Mitra picks a project, then captures or selects a photo. The Expo image
// picker returns EXIF directly (set `exif: true`); we forward GPS as fallback
// so the server can still place the pole even when the JPEG was re-encoded
// without EXIF (some devices strip metadata).

import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
  Image, ScrollView, Alert, TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { API_URL, api } from '../lib/api';

type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  vendorName: string;
  status: string;
  polesTagged: number;
  estimatedLengthMeters: number;
  nearEnd: { name: string; latitude: number; longitude: number };
  farEnd: { name: string; latitude: number; longitude: number };
};

type Pole = {
  id: string;
  sequence: number;
  photoUrl: string;
  latitude: number;
  longitude: number;
  capturedAt: string | null;
  uploadedBy: string;
  note: string;
};

type ProjectDetail = ProjectSummary & {
  description: string;
  poles: Pole[];
};

export function FiberTaggingScreen() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function loadList() {
    try {
      const r = await api<{ items: ProjectSummary[] }>('/v1/fiber-projects', { auth: false });
      setProjects(r.items);
    } catch {
      setProjects([]);
    }
  }

  async function loadDetail(id: string) {
    setOpenId(id);
    setDetail(null);
    try {
      const d = await api<ProjectDetail>(`/v1/fiber-projects/${id}`, { auth: false });
      setDetail(d);
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  }

  useEffect(() => { void loadList(); }, []);

  async function tagPhoto(source: 'camera' | 'gallery') {
    if (!openId) return;
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to capture/select photos.');
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ exif: true, quality: 0.85, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ exif: true, quality: 0.85, allowsEditing: false, mediaTypes: ImagePicker.MediaTypeOptions.Images });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    const exif = (asset as { exif?: Record<string, unknown> }).exif ?? {};
    const lat = pickGps(exif, 'GPSLatitude', 'GPSLatitudeRef');
    const lon = pickGps(exif, 'GPSLongitude', 'GPSLongitudeRef');
    const captured = (exif.DateTimeOriginal as string | undefined) ?? null;

    setBusy(true);
    try {
      const fd = new FormData();
      // @ts-expect-error — RN FormData accepts {uri, name, type}
      fd.append('photo', { uri: asset.uri, name: 'pole.jpg', type: 'image/jpeg' });
      fd.append('uploadedBy', 'mitra-mobile@demo');
      fd.append('note', note);
      if (lat != null) fd.append('fallbackLatitude', String(lat));
      if (lon != null) fd.append('fallbackLongitude', String(lon));
      if (captured) {
        const iso = new Date(captured.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')).toISOString();
        fd.append('fallbackCapturedAt', iso);
      }

      const res = await fetch(`${API_URL}/v1/fiber-projects/${openId}/photos`, { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) {
        Alert.alert('Upload failed', j.detail ?? j.code ?? `HTTP ${res.status}`);
      } else {
        Alert.alert('Tagged', `Pole #${j.pole.sequence} added (GPS: ${j.gpsSource}).`);
        setNote('');
        await loadDetail(openId);
        await loadList();
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- Render ---------------------------------------------------------------
  if (openId && detail) {
    return (
      <ScrollView style={styles.root}>
        <Pressable onPress={() => { setOpenId(null); setDetail(null); }}>
          <Text style={styles.back}>← Back to projects</Text>
        </Pressable>
        <Text style={styles.title}>{detail.name}</Text>
        <Text style={styles.meta}>{detail.code} · {detail.customerName}</Text>

        <View style={styles.statRow}>
          <Stat label="Poles" value={String(detail.polesTagged)} />
          <Stat label="Length" value={`${(detail.estimatedLengthMeters / 1000).toFixed(2)} km`} />
          <Stat label="Status" value={detail.status} />
        </View>

        <View style={styles.endpointBox}>
          <Text style={styles.endpointTitle}>Near End (NE)</Text>
          <Text style={styles.endpointName}>{detail.nearEnd.name}</Text>
          <Text style={styles.coord}>{detail.nearEnd.latitude.toFixed(6)}, {detail.nearEnd.longitude.toFixed(6)}</Text>
        </View>
        <View style={styles.endpointBox}>
          <Text style={styles.endpointTitle}>Far End (FE)</Text>
          <Text style={styles.endpointName}>{detail.farEnd.name}</Text>
          <Text style={styles.coord}>{detail.farEnd.latitude.toFixed(6)}, {detail.farEnd.longitude.toFixed(6)}</Text>
        </View>

        <View style={styles.uploadBox}>
          <Text style={styles.sectionTitle}>Tag a New Pole</Text>
          <TextInput
            style={styles.input}
            placeholder="Note (optional)"
            value={note}
            onChangeText={setNote}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
              onPress={() => void tagPhoto('camera')}
              disabled={busy}
            >
              <Text style={styles.btnText}>📷 Take Photo</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
              onPress={() => void tagPhoto('gallery')}
              disabled={busy}
            >
              <Text style={styles.btnText}>🖼 From Gallery</Text>
            </Pressable>
          </View>
          {busy && <ActivityIndicator style={{ marginTop: 8 }} />}
        </View>

        <Text style={styles.sectionTitle}>Tagged Poles ({detail.poles.length})</Text>
        {detail.poles.map((p) => (
          <View key={p.id} style={styles.poleCard}>
            <Image source={{ uri: `${API_URL}${p.photoUrl}` }} style={styles.poleThumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.poleSeq}>Pole #{p.sequence}</Text>
              <Text style={styles.coord}>{p.latitude.toFixed(6)}, {p.longitude.toFixed(6)}</Text>
              {p.capturedAt && <Text style={styles.metaSmall}>{new Date(p.capturedAt).toLocaleString()}</Text>}
              {p.note ? <Text style={styles.metaSmall}>{p.note}</Text> : null}
            </View>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  if (!projects) return <ActivityIndicator style={{ marginTop: 30 }} />;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Fiber Optic Projects</Text>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={styles.empty}>No fiber projects available.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => void loadDetail(item.id)} style={styles.card}>
            <Text style={styles.code}>{item.code}</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.customerName}</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
              <Text style={styles.tag}>{item.polesTagged} poles</Text>
              <Text style={styles.tag}>{(item.estimatedLengthMeters / 1000).toFixed(2)} km</Text>
              <Text style={styles.tag}>{item.status}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// Convert Expo's EXIF GPS (which may already be a decimal number, or a [d,m,s]
// tuple with separate `Ref`) into a signed decimal degree.
function pickGps(exif: Record<string, unknown>, key: string, refKey: string): number | null {
  const v = exif[key];
  const ref = exif[refKey];
  let dec: number | null = null;
  if (typeof v === 'number') dec = v;
  else if (Array.isArray(v) && v.length === 3) {
    const [d, m, s] = v as number[];
    dec = d + m / 60 + s / 3600;
  }
  if (dec == null) return null;
  if (typeof ref === 'string' && (ref === 'S' || ref === 'W')) dec = -Math.abs(dec);
  return dec;
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  meta: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  metaSmall: { color: '#64748b', fontSize: 11 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 30 },
  back: { color: '#0284c7', fontSize: 13, marginBottom: 8 },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 8, marginBottom: 10, elevation: 1 },
  code: { fontWeight: '700', fontSize: 14, color: '#475569' },
  name: { fontWeight: '600', fontSize: 15, marginTop: 2 },
  tag: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 11, color: '#334155' },
  statRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  stat: { flex: 1, backgroundColor: 'white', padding: 8, borderRadius: 6, alignItems: 'center' },
  statLabel: { fontSize: 10, color: '#64748b', textTransform: 'uppercase' },
  statValue: { fontWeight: '700', fontSize: 14 },
  endpointBox: { backgroundColor: 'white', padding: 10, borderRadius: 6, marginBottom: 6 },
  endpointTitle: { fontSize: 11, color: '#64748b', textTransform: 'uppercase' },
  endpointName: { fontWeight: '600', fontSize: 14 },
  coord: { fontSize: 11, color: '#475569', fontFamily: 'monospace' },
  uploadBox: { backgroundColor: 'white', padding: 12, borderRadius: 8, marginVertical: 12 },
  sectionTitle: { fontWeight: '700', fontSize: 14, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 8 },
  btn: { flex: 1, padding: 12, borderRadius: 6, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#0f172a' },
  btnSecondary: { backgroundColor: '#475569' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'white', fontWeight: '600' },
  poleCard: { flexDirection: 'row', backgroundColor: 'white', padding: 8, borderRadius: 6, marginBottom: 6, gap: 8, alignItems: 'center' },
  poleThumb: { width: 60, height: 60, borderRadius: 4 },
  poleSeq: { fontWeight: '700' },
});
