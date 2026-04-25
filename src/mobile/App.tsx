// MVP single-screen shell with simple state-driven navigation.
// A real release should use @react-navigation/native; deferred to keep deps minimal.

import { useState } from 'react';
import { SafeAreaView, StatusBar, View, Text, StyleSheet } from 'react-native';
import { LoginScreen } from './screens/Login';
import { TodayScreen } from './screens/Today';
import { SiteDetailScreen } from './screens/SiteDetail';
import { MilestoneUpdateScreen } from './screens/MilestoneUpdate';
import { SyncStatusScreen } from './screens/SyncStatus';
import { ProfileScreen } from './screens/Profile';
import { FiberTaggingScreen } from './screens/FiberTagging';
import { initDb } from './lib/db';

export type Route =
  | { name: 'login' }
  | { name: 'today' }
  | { name: 'site'; siteId: string }
  | { name: 'milestone'; milestoneId: string; siteId: string }
  | { name: 'sync' }
  | { name: 'fiber' }
  | { name: 'profile' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'login' });
  const [ready, setReady] = useState(false);

  if (!ready) {
    initDb().then(() => setReady(true)).catch(() => setReady(true));
    return (
      <SafeAreaView style={styles.center}><Text>Initializing…</Text></SafeAreaView>
    );
  }

  let screen: React.ReactNode = null;
  switch (route.name) {
    case 'login': screen = <LoginScreen onLoggedIn={() => setRoute({ name: 'today' })} />; break;
    case 'today': screen = <TodayScreen onOpenSite={(id) => setRoute({ name: 'site', siteId: id })} />; break;
    case 'site': screen = <SiteDetailScreen siteId={route.siteId} onOpenMilestone={(mid) => setRoute({ name: 'milestone', milestoneId: mid, siteId: route.siteId })} onBack={() => setRoute({ name: 'today' })} />; break;
    case 'milestone': screen = <MilestoneUpdateScreen milestoneId={route.milestoneId} onDone={() => setRoute({ name: 'site', siteId: route.siteId })} />; break;
    case 'sync': screen = <SyncStatusScreen />; break;
    case 'fiber': screen = <FiberTaggingScreen />; break;
    case 'profile': screen = <ProfileScreen onLogout={() => setRoute({ name: 'login' })} />; break;
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>{screen}</View>
      {route.name !== 'login' && (
        <View style={styles.tabs}>
          <Tab label="Today" active={route.name === 'today'} onPress={() => setRoute({ name: 'today' })} />
          <Tab label="Fiber" active={route.name === 'fiber'} onPress={() => setRoute({ name: 'fiber' })} />
          <Tab label="Sync" active={route.name === 'sync'} onPress={() => setRoute({ name: 'sync' })} />
          <Tab label="Saya" active={route.name === 'profile'} onPress={() => setRoute({ name: 'profile' })} />
        </View>
      )}
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <View style={styles.tab}>
      <Text onPress={onPress} style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#e2e8f0', backgroundColor: 'white' },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabText: { color: '#64748b', fontSize: 14 },
  tabTextActive: { color: '#0f172a', fontWeight: '700' },
});
