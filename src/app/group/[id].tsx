import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PanResponder,
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
import {
  DAY_SHORT,
  addDays,
  dayNumber,
  formatLongDate,
  formatWeekRange,
  startOfWeek,
  todayISO,
  weekDays,
} from '@/lib/dates';
import AthletePanel, { MyEntry } from '@/components/AthletePanel';
import CoachPanel, { AthleteFeedback } from '@/components/CoachPanel';
import MonthCalendar from '@/components/MonthCalendar';
import KeyboardDone from '@/components/KeyboardDone';

type Group = { id: string; name: string; code: string; owner_id: string };
type EntryRow = {
  user_id: string;
  date: string;
  present: boolean;
  comment: string | null;
  fatigue: number | null;
};
type Member = { userId: string; name: string };

export default function GroupScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuth();
  const uid = session?.user.id ?? '';

  const [group, setGroup] = useState<Group | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState(todayISO());
  const [calOpen, setCalOpen] = useState(false);
  const weekStart = startOfWeek(selected);
  const days = weekDays(weekStart);

  const [workouts, setWorkouts] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [dataWeek, setDataWeek] = useState<string | null>(null);
  const reqRef = useRef(0);

  const isOwner = !!group && group.owner_id === uid;
  const isAthlete = profile?.role === 'athlete';
  const ready = dataWeek === weekStart;

  function goWeek(delta: number) {
    setSelected(addDays(selected, delta * 7));
  }

  // Scorrimento con il dito sui giorni: sinistra = settimana dopo, destra = settimana prima
  const goWeekRef = useRef(goWeek);
  goWeekRef.current = goWeek;
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -50) goWeekRef.current(1);
        else if (g.dx > 50) goWeekRef.current(-1);
      },
    })
  ).current;

  // 1) Carica il gruppo
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: err } = await supabase
        .from('groups')
        .select('id, name, code, owner_id')
        .eq('id', id)
        .maybeSingle();
      if (!active) return;
      if (err) setError(err.message);
      else setGroup((data as Group | null) ?? null);
      setGroupLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // 2) Carica i dati della settimana mostrata
  useEffect(() => {
    if (!group) return;
    const req = ++reqRef.current;
    const to = addDays(weekStart, 6);
    const empty: any = { data: [], error: null };

    (async () => {
      const workoutsReq: any = supabase
        .from('workouts')
        .select('date, description')
        .eq('group_id', group.id)
        .gte('date', weekStart)
        .lte('date', to);

      let entriesReq: any = empty;
      if (isOwner) {
        entriesReq = supabase
          .from('entries')
          .select('user_id, date, present, comment, fatigue')
          .eq('group_id', group.id)
          .gte('date', weekStart)
          .lte('date', to);
      } else if (isAthlete) {
        entriesReq = supabase
          .from('entries')
          .select('user_id, date, present, comment, fatigue')
          .eq('group_id', group.id)
          .eq('user_id', uid)
          .gte('date', weekStart)
          .lte('date', to);
      }

      const membersReq: any = isOwner
        ? supabase
            .from('group_members')
            .select('user_id, profiles(name, role)')
            .eq('group_id', group.id)
        : empty;

      const [w, e, m] = await Promise.all([workoutsReq, entriesReq, membersReq]);
      if (req !== reqRef.current) return;

      const firstError = w.error ?? e.error ?? m.error;
      if (firstError) setError('Non riesco a caricare i dati: ' + firstError.message);
      else setError(null);

      const wMap: Record<string, string> = {};
      ((w.data ?? []) as { date: string; description: string }[]).forEach((r) => {
        wMap[r.date] = r.description;
      });
      setWorkouts(wMap);
      setEntries((e.data ?? []) as EntryRow[]);

      const list: Member[] = ((m.data ?? []) as any[])
        .map((r) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          return {
            userId: r.user_id as string,
            name: (p?.name ?? 'Atleta') as string,
            role: p?.role,
          };
        })
        .filter((x) => x.role === 'athlete')
        .map(({ userId, name }) => ({ userId, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'it'));
      setMembers(list);

      setDataWeek(weekStart);
    })();
  }, [group, weekStart, isOwner, isAthlete, uid]);

  function onWorkoutSaved(date: string, text: string) {
    setWorkouts((prev) => ({ ...prev, [date]: text }));
  }

  function onEntrySaved(date: string, entry: MyEntry) {
    setEntries((prev) => [
      ...prev.filter((r) => !(r.user_id === uid && r.date === date)),
      { user_id: uid, date, ...entry },
    ]);
  }

  async function shareCode() {
    if (!group) return;
    await Share.share({
      message: `Entra nel mio gruppo "${group.name}" su Swim Folder con il codice: ${group.code}`,
    });
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  const workoutText = workouts[selected] ?? '';
  const isCurrentWeek = startOfWeek(todayISO()) === weekStart;

  function renderDayPanel() {
    if (!group) return null;
    if (!ready) {
      return (
        <View style={styles.panelLoading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    if (isOwner) {
      const feedback: AthleteFeedback[] = members.map((m) => {
        const e = entries.find((r) => r.user_id === m.userId && r.date === selected);
        return {
          userId: m.userId,
          name: m.name,
          entry: e ? { present: e.present, comment: e.comment, fatigue: e.fatigue } : null,
        };
      });
      return (
        <CoachPanel
          key={selected}
          groupId={group.id}
          date={selected}
          initialText={workoutText}
          feedback={feedback}
          onSaved={onWorkoutSaved}
        />
      );
    }

    if (isAthlete) {
      const mine = entries.find((r) => r.user_id === uid && r.date === selected);
      return (
        <AthletePanel
          key={selected}
          groupId={group.id}
          userId={uid}
          date={selected}
          workoutText={workoutText}
          initial={
            mine ? { present: mine.present, comment: mine.comment, fatigue: mine.fatigue } : null
          }
          onSaved={onEntrySaved}
        />
      );
    }

    // Allenatore che ha solo il codice: sola lettura
    return (
      <View>
        <Text style={styles.sectionLabel}>Allenamento</Text>
        <View style={styles.box}>
          {workoutText.trim() ? (
            <Text style={styles.workout}>{workoutText}</Text>
          ) : (
            <Text style={styles.muted}>Nessun allenamento scritto per questo giorno.</Text>
          )}
        </View>
        <Text style={[styles.muted, { marginTop: 14 }]}>
          Hai accesso a questo gruppo in sola lettura.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={goBack} style={styles.back} hitSlop={10}>
        <Text style={styles.backText}>‹ Indietro</Text>
      </Pressable>

      {groupLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !group ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error ?? 'Gruppo non trovato.'}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={styles.title}>{group.name}</Text>

            {isOwner && (
              <>
                <View style={styles.codeCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.codeLabel}>Codice gruppo</Text>
                    <Text selectable style={styles.code}>
                      {group.code}
                    </Text>
                  </View>
                  <Pressable style={styles.shareButton} onPress={shareCode}>
                    <Text style={styles.shareText}>Condividi</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.athletesButton}
                  onPress={() =>
                    router.push({
                      pathname: '/athletes',
                      params: { groupId: group.id, groupName: group.name },
                    })
                  }
                >
                  <Text style={styles.athletesText}>
                    Atleti del gruppo{ready ? ` (${members.length})` : ''}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </>
            )}

            <View style={styles.weekHeader}>
              <Pressable onPress={() => goWeek(-1)} style={styles.arrow} hitSlop={8}>
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>

              <View style={{ alignItems: 'center' }}>
                <Pressable onPress={() => setCalOpen(true)} hitSlop={8}>
                  <Text style={styles.weekText}>{formatWeekRange(weekStart)} ▾</Text>
                </Pressable>
                {!isCurrentWeek && (
                  <Pressable onPress={() => setSelected(todayISO())} hitSlop={8}>
                    <Text style={styles.todayLink}>Torna a oggi</Text>
                  </Pressable>
                )}
              </View>

              <Pressable onPress={() => goWeek(1)} style={styles.arrow} hitSlop={8}>
                <Text style={styles.arrowText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.strip} {...swipe.panHandlers}>
              {days.map((d, i) => {
                const isSel = d === selected;
                const isToday = d === todayISO();
                const hasWorkout = ready && !!workouts[d]?.trim();
                return (
                  <Pressable
                    key={d}
                    style={[
                      styles.day,
                      isToday && styles.dayToday,
                      isSel && styles.daySelected,
                    ]}
                    onPress={() => setSelected(d)}
                  >
                    <Text style={[styles.dayLabel, isSel && styles.dayTextSel]}>
                      {DAY_SHORT[i]}
                    </Text>
                    <Text style={[styles.dayNumber, isSel && styles.dayTextSel]}>
                      {dayNumber(d)}
                    </Text>
                    <View
                      style={[
                        styles.dot,
                        hasWorkout && (isSel ? styles.dotOnSel : styles.dotOn),
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Text style={styles.dayTitle}>{formatLongDate(selected)}</Text>
            {renderDayPanel()}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <MonthCalendar
        visible={calOpen}
        selected={selected}
        onSelect={setSelected}
        onClose={() => setCalOpen(false)}
      />
      <KeyboardDone />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  back: { paddingHorizontal: 20, paddingTop: 12 },
  backText: { color: colors.primary, fontSize: 17 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 16 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, marginBottom: 10 },

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

  athletesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  athletesText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 26, color: colors.muted, lineHeight: 28 },

  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  arrow: { paddingHorizontal: 14, paddingVertical: 4 },
  arrowText: { fontSize: 32, color: colors.primary, lineHeight: 34 },
  weekText: { fontSize: 17, fontWeight: '600', color: colors.text },
  todayLink: { fontSize: 14, color: colors.primary, marginTop: 2 },

  strip: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  dayToday: { borderColor: colors.primary },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayLabel: { fontSize: 12, color: colors.muted },
  dayNumber: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  dayTextSel: { color: '#fff' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 6, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.primary },
  dotOnSel: { backgroundColor: '#fff' },

  dayTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 14 },
  panelLoading: { paddingVertical: 40, alignItems: 'center' },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 8 },
  box: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
  },
  workout: { fontSize: 16, color: colors.text, lineHeight: 23 },
});