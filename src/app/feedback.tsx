import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { formatLongDate } from '@/lib/dates';
import { SLOT_LABEL, Slot } from '@/lib/sessions';

type Entry = { present: boolean; comment: string | null; fatigue: number | null };

const GREEN = '#2E7D32';

export default function FeedbackDetail() {
  const router = useRouter();
  const { groupId, userId, date, slot } = useLocalSearchParams<{
    groupId: string;
    userId: string;
    date: string;
    slot?: string;
  }>();
  const slotValue: Slot = slot === 'morning' ? 'morning' : 'afternoon';

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [e, p] = await Promise.all([
        supabase
          .from('entries')
          .select('present, comment, fatigue')
          .eq('group_id', groupId)
          .eq('user_id', userId)
          .eq('date', date)
          .eq('slot', slotValue)
          .maybeSingle(),
        supabase.from('profiles').select('name').eq('id', userId).maybeSingle(),
      ]);
      if (!active) return;
      if (e.error) setError(e.error.message);
      setEntry((e.data as Entry | null) ?? null);
      setName((p.data as { name: string } | null)?.name ?? 'Atleta');
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [groupId, userId, date, slotValue]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  const available = !!entry && entry.present;

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
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.date}>
            {date ? formatLongDate(date) : ''} · {SLOT_LABEL[slotValue]}
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          {!available ? (
            <Text style={styles.muted}>Nessun feedback disponibile per questo allenamento.</Text>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.label}>Presenza</Text>
                <Text style={[styles.presence, { color: GREEN }]}>PRESENTE</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.label}>RPE</Text>
                {entry!.fatigue != null ? (
                  <Text style={styles.fatigue}>
                    {entry!.fatigue}
                    <Text style={styles.fatigueMax}> / 10</Text>
                  </Text>
                ) : (
                  <Text style={styles.notSet}>Non inserita</Text>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.label}>Commento</Text>
                {entry!.comment ? (
                  <Text style={styles.comment}>{entry!.comment}</Text>
                ) : (
                  <Text style={styles.notSet}>Nessun commento.</Text>
                )}
              </View>
            </>
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
  date: { fontSize: 16, color: colors.muted, marginTop: 4, marginBottom: 22 },
  error: { color: colors.danger, fontSize: 14, marginBottom: 12 },
  muted: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  presence: { fontSize: 20, fontWeight: '700' },
  fatigue: { fontSize: 40, fontWeight: '700', color: colors.primary },
  fatigueMax: { fontSize: 20, color: colors.muted, fontWeight: '400' },
  notSet: { fontSize: 16, color: colors.muted, fontStyle: 'italic' },
  comment: { fontSize: 16, color: colors.text, lineHeight: 24 },
});