import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

type Group = { id: string; name: string; owner_id: string };

export default function Home() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isCoach = profile?.role === 'coach';

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('groups')
      .select('id, name, owner_id')
      .order('created_at', { ascending: true });

    if (err) {
      setError('Non riesco a caricare i gruppi: ' + err.message);
      setGroups((prev) => prev ?? []);
      return;
    }

    setError(null);
    const list = (data ?? []) as Group[];
    setGroups(list);

    if (isCoach && list.length === 0) {
      router.replace({ pathname: '/create-group', params: { first: '1' } });
    }
  }, [isCoach, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const showSpinner = groups === null || (isCoach && groups.length === 0 && !error);

  function badgeFor(g: Group) {
    if (g.owner_id === session?.user.id) return 'Tuo gruppo';
    return isCoach ? 'Sola lettura' : 'Iscritto';
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Ciao, {profile?.name}</Text>
          <Text style={styles.role}>{isCoach ? 'Allenatore' : 'Atleta'}</Text>
        </View>
        <Pressable
          style={styles.profileButton}
          onPress={() => router.push('/profile')}
          hitSlop={10}
        >
          <Text style={styles.profileText}>Profilo</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>I tuoi gruppi</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {showSpinner ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={groups ?? []}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Non fai ancora parte di nessun gruppo. Chiedi il codice al tuo allenatore e
              tocca "Entra con un codice".
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/group/${item.id}`)}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.badge}>{badgeFor(item)}</Text>
            </Pressable>
          )}
        />
      )}

      <View style={styles.footer}>
        {isCoach && (
          <Pressable style={styles.primaryButton} onPress={() => router.push('/create-group')}>
            <Text style={styles.primaryText}>Crea nuovo gruppo</Text>
          </Pressable>
        )}
        <Pressable
          style={isCoach ? styles.secondaryButton : styles.primaryButton}
          onPress={() => router.push('/join-group')}
        >
          <Text style={isCoach ? styles.secondaryText : styles.primaryText}>
            Entra con un codice
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 8 },
  hello: { fontSize: 24, fontWeight: '700', color: colors.text },
  role: { fontSize: 14, color: colors.muted, marginTop: 2 },
  profileButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  profileText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.muted,
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 12, flexGrow: 1 },
  empty: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 40 },
  error: { color: colors.danger, paddingHorizontal: 20, marginBottom: 8, fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  badge: { fontSize: 13, color: colors.primary, marginTop: 6 },
  footer: { padding: 20, gap: 10 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { color: colors.primary, fontSize: 17, fontWeight: '600' },
});