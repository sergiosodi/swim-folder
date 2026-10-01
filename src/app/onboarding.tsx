import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Role, useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

type Step = 'role' | 'name';

export default function Onboarding() {
  const { session, refreshProfile, signOut } = useAuth();
  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseRole(r: Role) {
    setRole(r);
    setError(null);
    setStep('name');
  }

  async function save() {
    if (busy || !role || !session) return;
    const clean = name.trim();
    if (clean.length < 2) {
      setError('Inserisci il tuo nome (almeno 2 caratteri).');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('profiles')
        .insert({ id: session.user.id, name: clean, role });

      if (err && err.code !== '23505') {
        setError('Non sono riuscito a salvare il profilo: ' + err.message);
        return;
      }
      await refreshProfile();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Errore imprevisto.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'role' ? (
            <>
              <Text style={styles.title}>Come userai l'app?</Text>
              <Text style={styles.subtitle}>
                Attenzione: questa scelta non potrà essere cambiata in seguito.
              </Text>

              <Pressable style={styles.card} onPress={() => chooseRole('athlete')}>
                <Text style={styles.cardTitle}>Sono un atleta</Text>
                <Text style={styles.cardText}>
                  Entri nel gruppo con un codice, vedi gli allenamenti e scrivi i tuoi
                  feedback.
                </Text>
              </Pressable>

              <Pressable style={styles.card} onPress={() => chooseRole('coach')}>
                <Text style={styles.cardTitle}>Sono un allenatore</Text>
                <Text style={styles.cardText}>
                  Crei i gruppi, scrivi gli allenamenti e leggi i feedback degli atleti.
                </Text>
              </Pressable>

              <Pressable onPress={signOut} style={styles.linkRow} hitSlop={8}>
                <Text style={styles.linkText}>Esci dall'account</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Come ti chiami?</Text>
              <Text style={styles.subtitle}>
                Ruolo scelto: {role === 'coach' ? 'allenatore' : 'atleta'}
              </Text>

              <Text style={styles.label}>Nome</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Es. Marco Rossi"
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={40}
                autoFocus
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
                  <Text style={styles.buttonText}>Continua</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setStep('role');
                  setError(null);
                }}
                style={styles.linkRow}
                hitSlop={8}
                disabled={busy}
              >
                <Text style={styles.linkText}>Indietro</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 20,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 20, fontWeight: '600', color: colors.primary, marginBottom: 6 },
  cardText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  label: { fontSize: 14, color: colors.text, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
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
  linkRow: { marginTop: 20, alignItems: 'center' },
  linkText: { color: colors.primary, fontSize: 15 },
});