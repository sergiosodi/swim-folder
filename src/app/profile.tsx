import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Role, useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

const ROLE_LABEL: Record<Role, string> = { athlete: 'Atleta', coach: 'Allenatore' };

function RoleOption({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.roleButton, selected && styles.roleButtonOn]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text style={[styles.roleText, selected && styles.roleTextOn]}>{label}</Text>
    </Pressable>
  );
}

export default function Profile() {
  const router = useRouter();
  const { session, profile, refreshProfile, signOut } = useAuth();
  const uid = session?.user.id ?? '';

  const [name, setName] = useState(profile?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [busyRole, setBusyRole] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function saveName() {
    const clean = name.trim();
    setNameMsg(null);
    setNameError(null);
    if (clean.length < 2) {
      setNameError('Inserisci un nome di almeno 2 caratteri.');
      return;
    }
    if (clean === profile?.name) return;

    setSavingName(true);
    const { error } = await supabase.from('profiles').update({ name: clean }).eq('id', uid);
    setSavingName(false);
    if (error) {
      setNameError('Non sono riuscito a salvare: ' + error.message);
      return;
    }
    await refreshProfile();
    setNameMsg('Nome aggiornato ✓');
  }

  async function applyRole(target: Role, deleteGroups: boolean) {
    setBusyRole(true);
    setRoleError(null);
    const { error } = await supabase.rpc('change_role', {
      p_role: target,
      p_delete_groups: deleteGroups,
    });
    if (error) {
      setRoleError(
        error.message === 'OWNS_GROUPS'
          ? 'Hai ancora dei gruppi creati: riprova.'
          : 'Non sono riuscito a cambiare ruolo: ' + error.message
      );
      setBusyRole(false);
      return;
    }
    await refreshProfile();
    setBusyRole(false);
    router.replace('/');
  }

  async function askChangeRole(target: Role) {
    if (!profile || target === profile.role || busyRole) return;
    setRoleError(null);

    if (target === 'athlete') {
      const { data, error } = await supabase.from('groups').select('id').eq('owner_id', uid);
      if (error) {
        setRoleError('Non riesco a controllare i tuoi gruppi: ' + error.message);
        return;
      }
      const owned = data?.length ?? 0;

      if (owned > 0) {
        Alert.alert(
          'Diventare atleta?',
          `Hai creato ${owned} ${owned === 1 ? 'gruppo' : 'gruppi'}. Passando ad atleta ${
            owned === 1 ? 'verrà eliminato' : 'verranno eliminati'
          } definitivamente, insieme a tutti gli allenamenti e ai feedback. L'operazione non si può annullare.`,
          [
            { text: 'Annulla', style: 'cancel' },
            {
              text: 'Elimina e continua',
              style: 'destructive',
              onPress: () => applyRole('athlete', true),
            },
          ]
        );
        return;
      }

      Alert.alert(
        'Diventare atleta?',
        'Potrai entrare nei gruppi con un codice e scrivere i tuoi feedback.',
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Conferma', onPress: () => applyRole('athlete', false) },
        ]
      );
      return;
    }

    Alert.alert(
      'Diventare allenatore?',
      "Potrai creare gruppi e scrivere gli allenamenti. Nei gruppi a cui partecipi ora come atleta avrai l'accesso in sola lettura e i tuoi feedback non saranno più visibili all'allenatore.",
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Conferma', onPress: () => applyRole('coach', false) },
      ]
    );
  }

  const nameChanged = name.trim() !== (profile?.name ?? '');

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={goBack} style={styles.back} hitSlop={10}>
        <Text style={styles.backText}>‹ Indietro</Text>
      </Pressable>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(profile?.name ?? '?').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.title}>Il tuo profilo</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{session?.user.email}</Text>

            <Text style={[styles.label, { marginTop: 18 }]}>Nome</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(t) => {
                setName(t);
                setNameMsg(null);
                setNameError(null);
              }}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            {nameError && <Text style={styles.error}>{nameError}</Text>}
            {nameMsg && <Text style={styles.success}>{nameMsg}</Text>}
            {nameChanged && (
              <Pressable
                style={[styles.smallButton, savingName && styles.buttonDisabled]}
                onPress={saveName}
                disabled={savingName}
              >
                {savingName ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.smallButtonText}>Salva nome</Text>
                )}
              </Pressable>
            )}

            <Text style={[styles.label, { marginTop: 18 }]}>Ruolo attuale</Text>
            <Text style={styles.value}>{profile ? ROLE_LABEL[profile.role] : ''}</Text>
          </View>

          <Text style={styles.sectionTitle}>Cambia ruolo</Text>
          <View style={styles.roleRow}>
            <RoleOption
              label="Atleta"
              selected={profile?.role === 'athlete'}
              disabled={busyRole}
              onPress={() => askChangeRole('athlete')}
            />
            <RoleOption
              label="Allenatore"
              selected={profile?.role === 'coach'}
              disabled={busyRole}
              onPress={() => askChangeRole('coach')}
            />
          </View>
          {busyRole && <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} />}
          {roleError && <Text style={styles.error}>{roleError}</Text>}
          <Text style={styles.hint}>
            Se passi da allenatore ad atleta, i gruppi che hai creato vengono eliminati. Prima di
            farlo ti chiederò conferma.
          </Text>

          <Pressable style={styles.logout} onPress={signOut}>
            <Text style={styles.logoutText}>Esci dall'account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  back: { paddingHorizontal: 20, paddingTop: 12 },
  backText: { color: colors.primary, fontSize: 17 },
  content: { padding: 20, paddingBottom: 60 },
  avatar: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  avatarText: { color: '#fff', fontSize: 34, fontWeight: '700' },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 22,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  value: { fontSize: 17, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.background,
  },
  smallButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  smallButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
  error: { color: colors.danger, marginTop: 10, fontSize: 14 },
  success: { color: '#2E7D32', marginTop: 10, fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 28, marginBottom: 10 },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleButton: {
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
  roleButtonOn: { borderColor: colors.primary, backgroundColor: '#E8F1FC' },
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
  roleText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  roleTextOn: { color: colors.primary },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 12 },
  logout: {
    marginTop: 36,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: colors.danger, fontSize: 17, fontWeight: '600' },
});