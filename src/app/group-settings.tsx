import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { DAY_SHORT } from '@/lib/dates';
import { DEFAULT_AFTERNOON_DAYS } from '@/lib/sessions';

type Group = {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  morning_days: number[];
  afternoon_days: number[];
};

const sortDays = (a: number[]) => a.slice().sort((x, y) => x - y);

function DaysPicker({
  days,
  editable,
  onToggle,
}: {
  days: number[];
  editable: boolean;
  onToggle: (i: number) => void;
}) {
  return (
    <View style={styles.daysRow}>
      {DAY_SHORT.map((label, i) => {
        const on = days.includes(i);
        return (
          <Pressable
            key={label}
            disabled={!editable}
            style={[styles.dayChip, on && styles.dayChipOn, !editable && styles.dayChipReadonly]}
            onPress={() => onToggle(i)}
          >
            <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function GroupSettings() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [morning, setMorning] = useState<number[]>([]);
  const [afternoon, setAfternoon] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: err } = await supabase
        .from('groups')
        .select('id, name, code, owner_id, morning_days, afternoon_days')
        .eq('id', groupId)
        .maybeSingle();
      if (!active) return;
      if (err) setError(err.message);
      else if (data) {
        const g = data as Group;
        const m = sortDays(g.morning_days ?? []);
        const a = sortDays(g.afternoon_days ?? DEFAULT_AFTERNOON_DAYS);
        setGroup({ ...g, morning_days: m, afternoon_days: a });
        setMorning(m);
        setAfternoon(a);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [groupId]);

  const isOwner = !!group && group.owner_id === session?.user.id;
  const changed =
    !!group &&
    (JSON.stringify(morning) !== JSON.stringify(group.morning_days) ||
      JSON.stringify(afternoon) !== JSON.stringify(group.afternoon_days));

  function toggle(list: number[], setList: (v: number[]) => void, i: number) {
    setSaved(false);
    setError(null);
    setList(sortDays(list.includes(i) ? list.filter((d) => d !== i) : [...list, i]));
  }

  async function save() {
    if (!group || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('groups')
      .update({ morning_days: morning, afternoon_days: afternoon })
      .eq('id', group.id);
    setBusy(false);
    if (err) {
      setError('Non sono riuscito a salvare: ' + err.message);
      return;
    }
    setGroup({ ...group, morning_days: morning, afternoon_days: afternoon });
    setSaved(true);
  }

  async function shareCode() {
    if (!group) return;
    const message = `Entra nel mio gruppo "${group.name}" su Swim Folder con il codice: ${group.code}`;
    try {
      const nav: any = (globalThis as any).navigator;
      if (Platform.OS === 'web' && !(nav && nav.share)) {
        await nav?.clipboard?.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      }
      await Share.share({ message });
    } catch {
      // condivisione annullata: niente da fare
    }
  }

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
      ) : !group ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error ?? 'Gruppo non trovato.'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Impostazioni del gruppo</Text>
          <Text style={styles.subtitle}>{group.name}</Text>

          {isOwner ? (
            <>
              <View style={styles.codeCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.codeLabel}>Codice gruppo</Text>
                  <Text selectable style={styles.code}>
                    {group.code}
                  </Text>
                </View>
                <Pressable style={styles.shareButton} onPress={shareCode}>
                  <Text style={styles.shareText}>{copied ? 'Copiato ✓' : 'Condividi'}</Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/athletes',
                    params: { groupId: group.id, groupName: group.name },
                  })
                }
              >
                <Text style={styles.rowText}>Atleti del gruppo</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.readonlyBanner}>
              <Text style={styles.readonlyText}>
                Solo l'allenatore che ha creato il gruppo può modificare queste impostazioni.
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Allenamento di mattina</Text>
          <Text style={styles.muted}>
            {isOwner
              ? "Scegli i giorni della settimana in cui c'è l'allenamento di mattina."
              : "Giorni della settimana in cui c'è l'allenamento di mattina."}
          </Text>
          <DaysPicker
            days={morning}
            editable={isOwner}
            onToggle={(i) => toggle(morning, setMorning, i)}
          />

          <Text style={styles.sectionTitle}>Allenamento di pomeriggio</Text>
          <Text style={styles.muted}>
            {isOwner
              ? "Scegli i giorni della settimana in cui c'è l'allenamento di pomeriggio."
              : "Giorni della settimana in cui c'è l'allenamento di pomeriggio."}
          </Text>
          <DaysPicker
            days={afternoon}
            editable={isOwner}
            onToggle={(i) => toggle(afternoon, setAfternoon, i)}
          />

          {isOwner && error && <Text style={styles.error}>{error}</Text>}

          {isOwner && changed && (
            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={save}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Salva impostazioni</Text>
              )}
            </Pressable>
          )}
          {isOwner && saved && <Text style={styles.saved}>Impostazioni salvate ✓</Text>}

          <Text style={styles.note}>
            {isOwner
              ? 'Nel calendario puoi comunque aggiungere o togliere ogni allenamento nei singoli giorni. Se cambi i giorni, la modifica vale anche per le settimane passate.'
              : "L'allenatore può aggiungere o togliere un allenamento anche in un singolo giorno del calendario."}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  back: { paddingHorizontal: 20, paddingTop: 12 },
  backText: { color: colors.primary, fontSize: 17 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted, marginTop: 4, marginBottom: 22 },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 22 },

  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  codeLabel: { fontSize: 13, color: colors.muted },
  code: { fontSize: 26, fontWeight: '700', letterSpacing: 5, color: colors.primary, marginTop: 2 },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  shareText: { color: colors.primary, fontSize: 15, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowText: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 26, color: colors.muted, lineHeight: 28 },
  readonlyBanner: {
    backgroundColor: '#E8F1FC',
    borderRadius: 12,
    padding: 14,
  },
  readonlyText: { fontSize: 14, color: colors.primaryDark, lineHeight: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 30, marginBottom: 6 },
  daysRow: { flexDirection: 'row', gap: 6, marginTop: 16 },
  dayChip: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipReadonly: { opacity: 0.85 },
  dayChipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  dayChipTextOn: { color: '#fff' },
  error: { color: colors.danger, marginTop: 14, fontSize: 14 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  saved: { color: '#2E7D32', textAlign: 'center', marginTop: 14, fontSize: 15 },
  note: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 26 },
});