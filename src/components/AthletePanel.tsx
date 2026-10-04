import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { SLOT_LOWER, Slot } from '@/lib/sessions';
import FatiguePicker from './FatiguePicker';
import { KEYBOARD_BAR_ID } from './KeyboardDone';

export type MyEntry = {
  present: boolean;
  comment: string | null;
  fatigue: number | null;
};

type Props = {
  groupId: string;
  userId: string;
  date: string;
  slot: Slot;
  workoutText: string;
  initial: MyEntry | null;
  onSaved: (date: string, entry: MyEntry) => void;
};

function PresenceButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.presenceButton, selected && styles.presenceButtonOn]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text style={[styles.presenceText, selected && styles.presenceTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function AthletePanel({
  groupId,
  userId,
  date,
  slot,
  workoutText,
  initial,
  onSaved,
}: Props) {
  // Di default l'atleta risulta PRESENTE
  const [present, setPresent] = useState(initial?.present ?? true);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [fatigue, setFatigue] = useState<number | null>(initial?.fatigue ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function touch() {
    setSaved(false);
    setError(null);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);

    // Se è assente, commento e fatica non vengono salvati
    const entry: MyEntry = present
      ? { present: true, comment: comment.trim() ? comment.trim() : null, fatigue }
      : { present: false, comment: null, fatigue: null };

    const { error: err } = await supabase.from('entries').upsert(
      {
        group_id: groupId,
        user_id: userId,
        date,
        slot,
        present: entry.present,
        comment: entry.comment,
        fatigue: entry.fatigue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'group_id,user_id,date,slot' }
    );

    setBusy(false);
    if (err) {
      setError('Non sono riuscito a salvare: ' + err.message);
      return;
    }
    setSaved(true);
    onSaved(date, entry);
  }

  return (
    <View>
      <View style={styles.presenceRow}>
        <PresenceButton
          label="PRESENTE"
          selected={present}
          onPress={() => {
            setPresent(true);
            touch();
          }}
        />
        <PresenceButton
          label="ASSENTE"
          selected={!present}
          onPress={() => {
            setPresent(false);
            touch();
          }}
        />
      </View>

      <Text style={styles.sectionLabel}>Allenamento di {SLOT_LOWER[slot]}</Text>
      <View style={styles.box}>
        {workoutText.trim() ? (
          <Text style={styles.workout}>{workoutText}</Text>
        ) : (
          <Text style={styles.muted}>
            L'allenatore non ha ancora scritto questo allenamento.
          </Text>
        )}
      </View>

      {present && (
        <>
          <Text style={styles.sectionLabel}>Il tuo commento</Text>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={(t) => {
              setComment(t);
              touch();
            }}
            placeholder="Com'è andato l'allenamento? Scrivi il tuo feedback..."
            placeholderTextColor={colors.muted}
            multiline
            maxLength={1000}
            textAlignVertical="top"
            inputAccessoryViewID={KEYBOARD_BAR_ID}
          />

          <Text style={styles.sectionLabel}>FATICA GENERALE</Text>
          <Text style={styles.hint}>Tocca il campo e scegli un valore da 0 a 10.</Text>
          <FatiguePicker
            value={fatigue}
            onChange={(v) => {
              setFatigue(v);
              touch();
            }}
          />
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={save}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Salva feedback</Text>
        )}
      </Pressable>
      {saved && <Text style={styles.saved}>Feedback salvato ✓</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  presenceRow: { flexDirection: 'row', gap: 10 },
  presenceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  presenceButtonOn: { borderColor: colors.primary, backgroundColor: '#E8F1FC' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  presenceText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  presenceTextOn: { color: colors.primary },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 22, marginBottom: 8 },
  box: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
  },
  workout: { fontSize: 16, color: colors.text, lineHeight: 23 },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    minHeight: 110,
  },
  hint: { fontSize: 13, color: colors.muted, marginBottom: 10 },
  error: { color: colors.danger, marginTop: 12, fontSize: 14 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  saved: { color: '#2E7D32', textAlign: 'center', marginTop: 12, fontSize: 15 },
});