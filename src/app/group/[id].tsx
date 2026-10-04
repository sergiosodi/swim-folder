import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import {
  DEFAULT_AFTERNOON_DAYS,
  Overrides,
  SLOTS,
  SLOT_LABEL,
  SLOT_LOWER,
  SessionDays,
  Slot,
  defaultHasSession,
  hasSession,
  slotKey,
} from '@/lib/sessions';
import { confirmAction } from '@/lib/confirm';
import AthletePanel, { MyEntry } from '@/components/AthletePanel';
import CoachPanel, { AthleteFeedback } from '@/components/CoachPanel';
import MonthCalendar from '@/components/MonthCalendar';
import KeyboardDone from '@/components/KeyboardDone';

type Group = {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  morning_days: number[];
  afternoon_days: number[];
};
type EntryRow = {
  user_id: string;
  date: string;
  slot: Slot;
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
  const [selectedSlot, setSelectedSlot] = useState<Slot>('afternoon');
  const [calOpen, setCalOpen] = useState(false);
  const weekStart = startOfWeek(selected);
  const days = weekDays(weekStart);

  const [workouts, setWorkouts] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [dataWeek, setDataWeek] = useState<string | null>(null);
  const reqRef = useRef(0);

  const [busySession, setBusySession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isOwner = !!group && group.owner_id === uid;
  const isAthlete = profile?.role === 'athlete';
  const ready = dataWeek === weekStart;
  const sessionDays: SessionDays = {
    morning: group?.morning_days ?? [],
    afternoon: group?.afternoon_days ?? DEFAULT_AFTERNOON_DAYS,
  };

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

  // 1) Carica il gruppo (anche quando si torna da Impostazioni)
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { data, error: err } = await supabase
          .from('groups')
          .select('id, name, code, owner_id, morning_days, afternoon_days')
          .eq('id', id)
          .maybeSingle();
        if (!active) return;
        if (err) setError(err.message);
        else if (data) {
          const g = data as Group;
          setGroup({
            ...g,
            morning_days: g.morning_days ?? [],
            afternoon_days: g.afternoon_days ?? DEFAULT_AFTERNOON_DAYS,
          });
        } else setGroup(null);
        setGroupLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [id])
  );

  // 2) Carica i dati della settimana mostrata (si aggiorna anche a ogni ritorno sulla schermata)
  useEffect(() => {
    if (!group) return;
    const req = ++reqRef.current;
    const to = addDays(weekStart, 6);
    const empty: any = { data: [], error: null };

    (async () => {
      const workoutsReq: any = supabase
        .from('workouts')
        .select('date, slot, description')
        .eq('group_id', group.id)
        .gte('date', weekStart)
        .lte('date', to);

      const overridesReq: any = supabase
        .from('session_overrides')
        .select('date, slot, enabled')
        .eq('group_id', group.id)
        .gte('date', weekStart)
        .lte('date', to);

      let entriesReq: any = empty;
      if (isOwner) {
        entriesReq = supabase
          .from('entries')
          .select('user_id, date, slot, present, comment, fatigue')
          .eq('group_id', group.id)
          .gte('date', weekStart)
          .lte('date', to);
      } else if (isAthlete) {
        entriesReq = supabase
          .from('entries')
          .select('user_id, date, slot, present, comment, fatigue')
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

      const [w, o, e, m] = await Promise.all([workoutsReq, overridesReq, entriesReq, membersReq]);
      if (req !== reqRef.current) return;

      const firstError = w.error ?? o.error ?? e.error ?? m.error;
      if (firstError) setError('Non riesco a caricare i dati: ' + firstError.message);
      else setError(null);

      const wMap: Record<string, string> = {};
      ((w.data ?? []) as { date: string; slot: Slot; description: string }[]).forEach((r) => {
        wMap[slotKey(r.date, r.slot)] = r.description;
      });
      setWorkouts(wMap);

      const oMap: Overrides = {};
      ((o.data ?? []) as { date: string; slot: Slot; enabled: boolean }[]).forEach((r) => {
        oMap[slotKey(r.date, r.slot)] = r.enabled;
      });
      setOverrides(oMap);

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

  function onWorkoutSaved(date: string, slot: Slot, text: string) {
    setWorkouts((prev) => ({ ...prev, [slotKey(date, slot)]: text }));
  }

  function onEntrySaved(date: string, slot: Slot, entry: MyEntry) {
    setEntries((prev) => [
      ...prev.filter((r) => !(r.user_id === uid && r.date === date && r.slot === slot)),
      { user_id: uid, date, slot, ...entry },
    ]);
  }

  // Aggiunge o toglie un allenamento in un giorno preciso
  async function setSessionState(date: string, slot: Slot, enabled: boolean) {
    if (!group || busySession) return;
    setBusySession(true);
    setSessionError(null);

    const isDefault = enabled === defaultHasSession(date, slot, sessionDays);
    const { error: err } = isDefault
      ? await supabase
          .from('session_overrides')
          .delete()
          .eq('group_id', group.id)
          .eq('date', date)
          .eq('slot', slot)
      : await supabase
          .from('session_overrides')
          .upsert({ group_id: group.id, date, slot, enabled }, { onConflict: 'group_id,date,slot' });

    setBusySession(false);
    if (err) {
      setSessionError('Non sono riuscito a modificare il calendario: ' + err.message);
      return;
    }

    setOverrides((prev) => {
      const next = { ...prev };
      const k = slotKey(date, slot);
      if (isDefault) delete next[k];
      else next[k] = enabled;
      return next;
    });
  }

  function askRemoveSession(date: string, slot: Slot) {
    confirmAction({
      title: 'Togliere questo allenamento?',
      message: `L'allenamento di ${SLOT_LOWER[slot]} di ${formatLongDate(
        date
      )} sparirà dal calendario. Il testo e i feedback già scritti restano salvati e riappaiono se lo aggiungi di nuovo.`,
      confirmText: 'Togli allenamento',
      destructive: true,
      onConfirm: () => setSessionState(date, slot, false),
    });
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

    const existing = SLOTS.filter((s) => hasSession(selected, s, sessionDays, overrides));
    const tabs: Slot[] = isOwner ? SLOTS : existing;
    const slot: Slot | null = isOwner
      ? selectedSlot
      : existing.includes(selectedSlot)
      ? selectedSlot
      : existing[0] ?? null;

    const tabsView =
      tabs.length > 1 ? (
        <View style={styles.slotRow}>
          {tabs.map((s) => {
            const on = s === slot;
            const exists = existing.includes(s);
            return (
              <Pressable
                key={s}
                style={[styles.slotButton, on && styles.slotButtonOn]}
                onPress={() => setSelectedSlot(s)}
              >
                <Text
                  style={[
                    styles.slotText,
                    on && styles.slotTextOn,
                    !exists && !on && styles.slotTextOff,
                  ]}
                >
                  {SLOT_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null;

    if (!slot) {
      return <Text style={styles.muted}>Nessun allenamento in questo giorno.</Text>;
    }

    const exists = existing.includes(slot);
    const workoutText = workouts[slotKey(selected, slot)] ?? '';
    const panelKey = `${selected}|${slot}`;

    let body: React.ReactNode;

    if (isOwner) {
      if (!exists) {
        body = (
          <View style={styles.emptyBox}>
            <Text style={styles.muted}>
              Nessun allenamento di {SLOT_LOWER[slot]} in questo giorno.
            </Text>
            <Pressable
              style={[styles.addButton, busySession && styles.buttonDisabled]}
              onPress={() => setSessionState(selected, slot, true)}
              disabled={busySession}
            >
              <Text style={styles.addButtonText}>Aggiungi allenamento di {SLOT_LOWER[slot]}</Text>
            </Pressable>
          </View>
        );
      } else {
        const feedback: AthleteFeedback[] = members.map((m) => {
          const e = entries.find(
            (r) => r.user_id === m.userId && r.date === selected && r.slot === slot
          );
          return {
            userId: m.userId,
            name: m.name,
            entry: e ? { present: e.present, comment: e.comment, fatigue: e.fatigue } : null,
          };
        });
        body = (
          <>
            <CoachPanel
              key={panelKey}
              groupId={group.id}
              date={selected}
              slot={slot}
              initialText={workoutText}
              feedback={feedback}
              onSaved={(d, t) => onWorkoutSaved(d, slot, t)}
            />
            <Pressable
              style={[styles.removeButton, busySession && styles.buttonDisabled]}
              onPress={() => askRemoveSession(selected, slot)}
              disabled={busySession}
            >
              <Text style={styles.removeButtonText}>
                Togli l'allenamento di {SLOT_LOWER[slot]} da questo giorno
              </Text>
            </Pressable>
          </>
        );
      }
    } else if (isAthlete) {
      const mine = entries.find(
        (r) => r.user_id === uid && r.date === selected && r.slot === slot
      );
      body = (
        <AthletePanel
          key={panelKey}
          groupId={group.id}
          userId={uid}
          date={selected}
          slot={slot}
          workoutText={workoutText}
          initial={
            mine ? { present: mine.present, comment: mine.comment, fatigue: mine.fatigue } : null
          }
          onSaved={(d, entry) => onEntrySaved(d, slot, entry)}
        />
      );
    } else {
      // Allenatore che ha solo il codice: sola lettura
      body = (
        <View>
          <Text style={styles.sectionLabel}>Allenamento di {SLOT_LOWER[slot]}</Text>
          <View style={styles.box}>
            {workoutText.trim() ? (
              <Text style={styles.workout}>{workoutText}</Text>
            ) : (
              <Text style={styles.muted}>Nessun allenamento scritto.</Text>
            )}
          </View>
          <Text style={[styles.muted, { marginTop: 14 }]}>
            Hai accesso a questo gruppo in sola lettura.
          </Text>
        </View>
      );
    }

    return (
      <View>
        {tabsView}
        {sessionError && <Text style={styles.error}>{sessionError}</Text>}
        {body}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Text style={styles.backText}>‹ Indietro</Text>
        </Pressable>

        {group && (
          <Pressable
            style={styles.gearButton}
            onPress={() =>
              router.push({ pathname: '/group-settings', params: { groupId: group.id } })
            }
            hitSlop={10}
            accessibilityLabel="Impostazioni del gruppo"
          >
            <Ionicons name="settings-outline" size={26} color={colors.primary} />
          </Pressable>
        )}
      </View>

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
                const hasAny = SLOTS.some((s) => hasSession(d, s, sessionDays, overrides));
                const written = (s: Slot) =>
                  ready &&
                  hasSession(d, s, sessionDays, overrides) &&
                  !!workouts[slotKey(d, s)]?.trim();
                const dotStyle = (on: boolean) => [
                  styles.dot,
                  on && (isSel ? styles.dotOnSel : styles.dotOn),
                ];
                return (
                  <Pressable
                    key={d}
                    style={[
                      styles.day,
                      isToday && styles.dayToday,
                      isSel && styles.daySelected,
                      ready && !hasAny && styles.dayRest,
                    ]}
                    onPress={() => setSelected(d)}
                  >
                    <Text style={[styles.dayLabel, isSel && styles.dayTextSel]}>
                      {DAY_SHORT[i]}
                    </Text>
                    <Text style={[styles.dayNumber, isSel && styles.dayTextSel]}>
                      {dayNumber(d)}
                    </Text>
                    <View style={styles.dots}>
                      <View style={dotStyle(written('morning'))} />
                      <View style={dotStyle(written('afternoon'))} />
                    </View>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  backText: { color: colors.primary, fontSize: 17 },
  gearButton: { padding: 2 },
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
    marginBottom: 20,
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
  dayRest: { opacity: 0.5 },
  dayLabel: { fontSize: 12, color: colors.muted },
  dayNumber: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  dayTextSel: { color: '#fff' },
  dots: { flexDirection: 'row', gap: 3, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.primary },
  dotOnSel: { backgroundColor: '#fff' },

  dayTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 14 },
  panelLoading: { paddingVertical: 40, alignItems: 'center' },

  slotRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  slotButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  slotButtonOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotText: { fontSize: 15, fontWeight: '600', color: colors.text },
  slotTextOn: { color: '#fff' },
  slotTextOff: { color: colors.muted },

  emptyBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    gap: 14,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  removeButton: {
    marginTop: 30,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  removeButtonText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },

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