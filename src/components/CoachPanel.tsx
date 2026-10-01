import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { MyEntry } from './AthletePanel';
import { KEYBOARD_BAR_ID } from './KeyboardDone';

export type AthleteFeedback = {
  userId: string;
  name: string;
  entry: MyEntry | null;
};

type Props = {
  groupId: string;
  date: string;
  initialText: string;
  feedback: AthleteFeedback[];
  onSaved: (date: string, text: string) => void;
};

const GREEN = '#2E7D32';

export default function CoachPanel({ groupId, date, initialText, feedback, onSaved }: Props) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const clean = text.trim();
    const { error: err } = await supabase.from('workouts').upsert(
      {
        group_id: groupId,
        date,
        description: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'group_id,date' }
    );

    setBusy(false);
    if (err) {
      setError('Non sono riuscito a salvare: ' + err.message);
      return;
    }
    setSaved(true);
    onSaved(date, clean);
  }

  const present = feedback.filter((f) => f.entry?.present).length;
  const absent = feedback.filter((f) => f.entry && !f.entry.present).length;
  const missing = feedback.filter((f) => !f.entry).length;

  return (
    <View>
      <Text style={styles.sectionLabel}>Allenamento del giorno</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(t) => {
          setText(t);
          setSaved(false);
          setError(null);
        }}
        placeholder="Scrivi qui l'allenamento di questo giorno..."
        placeholderTextColor={colors.muted}
        multiline
        maxLength={4000}
        textAlignVertical="top"
        inputAccessoryViewID={KEYBOARD_BAR_ID}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={save}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Salva allenamento</Text>
        )}
      </Pressable>
      {saved && <Text style={styles.saved}>Allenamento salvato ✓</Text>}

      <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Feedback degli atleti</Text>

      {feedback.length === 0 ? (
        <Text style={styles.muted}>
          Nessun atleta nel gruppo per ora. Condividi il codice gruppo per farli entrare.
        </Text>
      ) : (
        <>
          <Text style={styles.summary}>
            Presenti {present} · Assenti {absent} · Senza feedback {missing}
          </Text>
          {feedback.map((f) => {
            const canOpen = !!f.entry && f.entry.present;
            return (
              <Pressable
                key={f.userId}
                disabled={!canOpen}
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: '/feedback',
                    params: { groupId, userId: f.userId, date },
                  })
                }
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.name}>{f.name}</Text>
                  {f.entry ? (
                    <Text
                      style={[
                        styles.badge,
                        { color: f.entry.present ? GREEN : colors.danger },
                      ]}
                    >
                      {f.entry.present ? 'PRESENTE' : 'ASSENTE'}
                    </Text>
                  ) : (
                    <Text style={[styles.badge, { color: colors.muted }]}>NESSUN FEEDBACK</Text>
                  )}
                  {canOpen && <Text style={styles.chevron}>›</Text>}
                </View>

                {f.entry?.present && (
                  <Text style={styles.fatigue}>
                    FATICA GENERALE:{' '}
                    <Text style={styles.fatigueValue}>
                      {f.entry.fatigue != null ? `${f.entry.fatigue}/10` : 'non inserita'}
                    </Text>
                  </Text>
                )}
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    minHeight: 160,
  },
  error: { color: colors.danger, marginTop: 12, fontSize: 14 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  saved: { color: GREEN, textAlign: 'center', marginTop: 12, fontSize: 15 },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  summary: { fontSize: 14, color: colors.muted, marginBottom: 12 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text, paddingRight: 8 },
  badge: { fontSize: 13, fontWeight: '700' },
  chevron: { fontSize: 26, color: colors.muted, marginLeft: 10, lineHeight: 28 },
  fatigue: { fontSize: 14, color: colors.muted, marginTop: 8 },
  fatigueValue: { color: colors.text, fontWeight: '700' },
});