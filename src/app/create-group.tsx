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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function CreateGroup() {
  const router = useRouter();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const isFirst = first === '1';
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (busy || !session) return;
    const clean = name.trim();
    if (clean.length < 2) {
      setError('Inserisci il nome del gruppo (almeno 2 caratteri).');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('groups')
        .insert({ name: clean, owner_id: session.user.id });

      if (err) {
        setError('Non sono riuscito a creare il gruppo: ' + err.message);
        return;
      }

      if (isFirst || !router.canGoBack()) {
        router.replace('/');
      } else {
        router.back();
      }
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>
            {isFirst ? 'Crea il tuo primo gruppo' : 'Nuovo gruppo'}
          </Text>
          <Text style={styles.subtitle}>
            Dai un nome al gruppo di allenamento. Il codice per far entrare gli atleti verrà
            generato in automatico.
          </Text>

          <Text style={styles.label}>Nome del gruppo</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Es. Squadra agonisti"
            placeholderTextColor={colors.muted}
            autoCapitalize="sentences"
            maxLength={40}
            autoFocus
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={create}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Crea gruppo</Text>
            )}
          </Pressable>

          {!isFirst && (
            <Pressable onPress={() => router.back()} style={styles.linkRow} hitSlop={8}>
              <Text style={styles.linkText}>Annulla</Text>
            </Pressable>
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
    lineHeight: 21,
  },
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