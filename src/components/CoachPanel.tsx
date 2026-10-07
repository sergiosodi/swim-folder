import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { SLOT_LOWER, Slot } from '@/lib/sessions';
import type { MyEntry } from './AthletePanel';

export type AthleteFeedback = {
  userId: string;
  name: string;
  entry: MyEntry | null;
};

type Props = {
  groupId: string;
  date: string;
  slot: Slot;
  initialText: string;
  feedback: AthleteFeedback[];
  onSaved: (date: string, text: string) => void;
};

const GREEN = '#2E7D32';

export default function CoachPanel({ groupId, date, slot, initialText, feedback, onSaved }: Props) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stato locale per gestire i click rapidi dell'allenatore sulle presenze
  const [localFeedback, setLocalFeedback] = useState<AthleteFeedback[]>(feedback);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const clean = text.trim();
    const { error: err } = await supabase.from('workouts').upsert(
      {
        group_id: groupId,
        date,
        slot,
        description: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'group_id,date,slot' }
    );

    setBusy(false);
    if (err) {
      setError('Non sono riuscito a salvare: ' + err.message);
      return;
    }
    setSaved(true);
    onSaved(date, clean);
  }

  // Funzione per permettere all'allenatore di segnare presente/assente l'atleta
  async function handleSetPresence(userId: string, present: boolean) {
    if (updatingUserId) return;
    setUpdatingUserId(userId);
    setError(null);

    const { error: err } = await supabase.from('entries').upsert(
      {
        group_id: groupId,
        user_id: userId,
        date,
        slot,
        present,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'group_id,user_id,date,slot' }
    );

    setUpdatingUserId(null);

    if (err) {
      setError('Errore aggiornamento presenza: ' + err.message);
      return;
    }

    // Aggiorna lo stato locale per riflettere subito la modifica nella UI
    setLocalFeedback((prev) =>
      prev.map((f) => {
        if (f.userId === userId) {
          return {
            ...f,
            entry: {
              ...(f.entry || { fatigue: null, notes: '' }),
              present,
            },
          };
        }
        return f;
      })
    );
  }

  const present = localFeedback.filter((f) => f.entry?.present).length;
  const absent = localFeedback.filter((f) => f.entry && !f.entry.present).length;
  const missing = localFeedback.filter((f) => !f.entry).length;

  return (
    <View>
      <Text style={styles.sectionLabel}>Allenamento di {SLOT_LOWER[slot]}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(t) => {
          setText(t);
          setSaved(false);
          setError(null);
        }}
        placeholder={`Scrivi qui l'allenamento di ${SLOT_LOWER[slot]}...`}
        placeholderTextColor={colors.muted}
        multiline
        maxLength={4000}
        textAlignVertical="top"
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

      {localFeedback.length === 0 ? (
        <Text style={styles.muted}>
          Nessun atleta nel gruppo per ora. Condividi il codice gruppo per farli entrare.
        </Text>
      ) : (
        <>
          <Text style={styles.summary}>
            Presenti {present} · Assenti {absent} · Senza feedback {missing}
          </Text>
          {localFeedback.map((f) => {
            const isUpdating = updatingUserId === f.userId;
            const isPresent = f.entry?.present === true;
            const isAbsent = f.entry?.present === false;
            const canOpen = !!f.entry && f.entry.present;

            return (
              <View key={f.userId} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Pressable
                    style={{ flex: 1 }}
                    disabled={!canOpen}
                    onPress={() =>
                      router.push({
                        pathname: '/feedback',
                        params: { groupId, userId: f.userId, date, slot },
                      })
                    }
                  >
                    <Text style={styles.name}>{f.name}</Text>
                  </Pressable>

                  {/* Pulsanti rapidi per l'allenatore */}
                  <View style={styles.actionButtons}>
                    <Pressable
                      style={[
                        styles.toggleBtn,
                        styles.presentBtn,
                        isPresent && styles.presentBtnActive,
                      ]}
                      onPress={() => handleSetPresence(f.userId, true)}
                      disabled={isUpdating}
                    >
                      <Text style={[styles.toggleText, isPresent && styles.toggleTextActive]}>
                        Pres.
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.toggleBtn,
                        styles.absentBtn,
                        isAbsent && styles.absentBtnActive,
                      ]}
                      onPress={() => handleSetPresence(f.userId, false)}
                      disabled={isUpdating}
                    >
                      <Text style={[styles.toggleText, isAbsent && styles.toggleTextActive]}>
                        Ass.
                      </Text>
                    </Pressable>
                  </View>

                  {canOpen && <Text style={styles.chevron}>›</Text>}
                </View>

                {isUpdating && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 6 }} />}

                {f.entry?.present && (
                  <Pressable
                    disabled={!canOpen}
                    onPress={() =>
                      router.push({
                        pathname: '/feedback',
                        params: { groupId, userId: f.userId, date, slot },
                      })
                    }
                  >
                    <Text style={styles.fatigue}>
                      RPE:{' '}
                      <Text style={styles.fatigueValue}>
                        {f.entry.fatigue != null ? `${f.entry.fatigue}/10` : 'non inserita'}
                      </Text>
                    </Text>
                  </Pressable>
                )}
              </View>
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
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 26, color: colors.muted, marginLeft: 10, lineHeight: 28 },
  fatigue: { fontSize: 14, color: colors.muted, marginTop: 8 },
  fatigueValue: { color: colors.text, fontWeight: '700' },
  actionButtons: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  presentBtnActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  absentBtnActive: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  toggleText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  toggleTextActive: { color: '#fff' },
});