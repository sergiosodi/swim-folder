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
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Mode = 'login' | 'signup';

function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o password non corretti.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Esiste già un account con questa email.';
  if (m.includes('password should be at least'))
    return 'La password deve avere almeno 6 caratteri.';
  if (m.includes('valid email') || m.includes('invalid email'))
    return 'Inserisci un indirizzo email valido.';
  if (m.includes('rate limit')) return 'Troppi tentativi. Riprova tra qualche minuto.';
  if (m.includes('network') || m.includes('fetch'))
    return 'Problema di connessione. Controlla internet e riprova.';
  return message;
}

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  function switchMode() {
    setMode(isSignup ? 'login' : 'signup');
    setError(null);
    setInfo(null);
    setConfirm('');
  }

  async function submit() {
    if (busy) return;
    setError(null);
    setInfo(null);

    const e = email.trim().toLowerCase();
    if (!e || !password) {
      setError('Inserisci email e password.');
      return;
    }
    if (isSignup && password.length < 6) {
      setError('La password deve avere almeno 6 caratteri.');
      return;
    }
    if (isSignup && password !== confirm) {
      setError('Le due password non coincidono.');
      return;
    }

    setBusy(true);
    try {
      if (!isSignup) {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: e,
          password,
        });
        if (err) setError(translateError(err.message));
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: e,
          password,
        });
        if (err) {
          setError(translateError(err.message));
        } else if (!data.session) {
          setInfo('Account creato. Controlla la tua email per confermarlo, poi accedi.');
          setMode('login');
          setConfirm('');
        }
      }
    } catch (ex) {
      setError(translateError(ex instanceof Error ? ex.message : 'Errore imprevisto.'));
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
          <Text style={styles.title}>Swim Folder</Text>
          <Text style={styles.subtitle}>Il diario di allenamento per nuotatori</Text>

          <Text style={styles.heading}>{isSignup ? 'Crea il tuo account' : 'Accedi'}</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="nome@esempio.it"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Almeno 6 caratteri"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={isSignup ? 'newPassword' : 'password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
              <Text style={styles.toggleText}>{showPassword ? 'Nascondi' : 'Mostra'}</Text>
            </Pressable>
          </View>

          {isSignup && (
            <>
              <Text style={styles.label}>Ripeti la password</Text>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Ripeti la password"
                placeholderTextColor={colors.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
          {info && <Text style={styles.info}>{info}</Text>}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{isSignup ? 'Registrati' : 'Accedi'}</Text>
            )}
          </Pressable>

          <Pressable onPress={switchMode} style={styles.switchRow} hitSlop={8}>
            <Text style={styles.switchText}>
              {isSignup ? 'Hai già un account? ' : 'Non hai un account? '}
              <Text style={styles.switchLink}>{isSignup ? 'Accedi' : 'Registrati'}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 34, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 32,
  },
  heading: { fontSize: 22, fontWeight: '600', color: colors.text, marginBottom: 16 },
  label: { fontSize: 14, color: colors.text, marginBottom: 6, marginTop: 12 },
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  passwordInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text },
  toggleText: { color: colors.primary, fontSize: 14, paddingLeft: 10 },
  error: { color: colors.danger, marginTop: 14, fontSize: 14 },
  info: { color: colors.primaryDark, marginTop: 14, fontSize: 14 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  switchRow: { marginTop: 20, alignItems: 'center' },
  switchText: { color: colors.muted, fontSize: 15 },
  switchLink: { color: colors.primary, fontWeight: '600' },
});