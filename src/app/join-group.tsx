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
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function JoinGroup() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (busy) return;
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      setError('Il codice è composto da 6 caratteri.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('join_group', { p_code: clean });
      if (err) {
        setError(err.message);
        return;
      }
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
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
          <Text style={styles.title}>Entra in un gruppo</Text>
          <Text style={styles.subtitle}>
            Inserisci il codice di 6 caratteri che ti ha dato l'allenatore.
          </Text>

          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="ABC123"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            autoFocus
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={join}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Entra</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.linkRow} hitSlop={8}>
            <Text style={styles.linkText}>Annulla</Text>
          </Pressable>
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
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 26,
    letterSpacing: 6,
    textAlign: 'center',
    color: colors.text,
  },
  error: { color: colors.danger, marginTop: 14, fontSize: 14, textAlign: 'center' },
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