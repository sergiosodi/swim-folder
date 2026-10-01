import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Athlete = { id: string; name: string };

export default function Athletes() {
  const router = useRouter();
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName?: string }>();
  const [loading, setLoading] = useState(true);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: err } = await supabase
        .from('group_members')
        .select('user_id, profiles(name, role)')
        .eq('group_id', groupId);
      if (!active) return;

      if (err) {
        setError('Non riesco a caricare gli atleti: ' + err.message);
      } else {
        const list: Athlete[] = ((data ?? []) as any[])
          .map((r) => {
            const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
            return { id: r.user_id as string, name: (p?.name ?? 'Atleta') as string, role: p?.role };
          })
          .filter((x) => x.role === 'athlete')
          .map(({ id, name }) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'it'));
        setAthletes(list);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [groupId]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={goBack} style={styles.back} hitSlop={10}>
        <Text style={styles.backText}>‹ Indietro</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Atleti del gruppo</Text>
          {!!groupName && <Text style={styles.subtitle}>{groupName}</Text>}

          {error && <Text style={styles.error}>{error}</Text>}

          {!error && (
            <Text style={styles.count}>
              {athletes.length === 1 ? '1 atleta' : `${athletes.length} atleti`}
            </Text>
          )}

          {!error && athletes.length === 0 ? (
            <Text style={styles.muted}>
              Nessun atleta è ancora entrato nel gruppo. Condividi il codice gruppo per farli
              entrare.
            </Text>
          ) : (
            athletes.map((a) => (
              <View key={a.id} style={styles.card}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{a.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.name}>{a.name}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  back: { paddingHorizontal: 20, paddingTop: 12 },
  backText: { color: colors.primary, fontSize: 17 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted, marginTop: 4 },
  count: { fontSize: 14, color: colors.muted, marginTop: 18, marginBottom: 12 },
  error: { color: colors.danger, fontSize: 14, marginTop: 14 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F1FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  name: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
});