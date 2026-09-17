import { useColors, ColorPalette } from '@/lib/constants';
import { useAppDialog } from '@/lib/dialog';
import { changePassword, signOut } from '@/lib/firebase/auth';
import { clearMustChangePassword } from '@/lib/firebase/users';
import { useAuthStore } from '@/store/auth';
import { Feather } from '@expo/vector-icons';
import { Spinner } from 'heroui-native';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ChangePasswordScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showAlert } = useAppDialog();
  const { user, setUser, reset } = useAuthStore();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
      reset();
    } catch {
      showAlert('Sign out failed', 'Something went wrong. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleSubmit() {
    if (!currentPw) { showAlert('Required', 'Enter your current (temporary) password.'); return; }
    if (newPw.length < 6) { showAlert('Too short', 'New password must be at least 6 characters.'); return; }
    if (newPw === currentPw) { showAlert('Same password', 'New password must be different from your current password.'); return; }
    if (newPw !== confirmPw) { showAlert('Mismatch', 'New passwords do not match.'); return; }

    setIsLoading(true);
    const error = await changePassword(currentPw, newPw);
    if (error) {
      setIsLoading(false);
      showAlert('Couldn’t change password', error);
      return;
    }

    try {
      if (user) {
        await clearMustChangePassword(user.uid);
        setUser({ ...user, mustChangePassword: false });
      }
    } catch {
      // Password already changed successfully - a failure clearing the flag
      // just means they'd see this screen again next login, not a real loss.
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.title}>Set a new password</Text>
          <Text style={styles.subtitle}>
            You&apos;re signing in with a temporary password. Set your own before continuing.
          </Text>

          <Field label="Current (temporary) password" icon="lock" C={C} styles={styles}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Enter your temporary password"
              placeholderTextColor={C.textSec}
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry={!showCurrent}
            />
            <TouchableOpacity onPress={() => setShowCurrent((v) => !v)} style={styles.eyeBtn}>
              <Feather name={showCurrent ? 'eye-off' : 'eye'} size={16} color={C.textSec} />
            </TouchableOpacity>
          </Field>

          <Field label="New password" icon="lock" C={C} styles={styles}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Create a new password"
              placeholderTextColor={C.textSec}
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry={!showNew}
            />
            <TouchableOpacity onPress={() => setShowNew((v) => !v)} style={styles.eyeBtn}>
              <Feather name={showNew ? 'eye-off' : 'eye'} size={16} color={C.textSec} />
            </TouchableOpacity>
          </Field>

          <Field label="Confirm new password" icon="lock" C={C} styles={styles}>
            <TextInput
              style={styles.input}
              placeholder="Repeat your new password"
              placeholderTextColor={C.textSec}
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry={!showNew}
            />
          </Field>

          <TouchableOpacity
            style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? <Spinner size="sm" /> : <Text style={styles.submitBtnText}>Set new password</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSignOut} disabled={isSigningOut} style={styles.linkBtn}>
            <Text style={styles.linkText}>{isSigningOut ? 'Signing out…' : 'Sign out instead'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type ChangePasswordStyles = ReturnType<typeof makeStyles>;

function Field({
  label,
  icon,
  C,
  styles,
  children,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  C: ColorPalette;
  styles: ChangePasswordStyles;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <Feather name={icon} size={16} color={C.textSec} style={styles.inputIcon} />
        {children}
      </View>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    card: {
      backgroundColor: C.surface,
      borderRadius: 20,
      padding: 28,
      borderWidth: 1,
      borderColor: C.border,
    },
    title: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 6, textAlign: 'center' },
    subtitle: { color: C.textSec, fontSize: 13, marginBottom: 24, textAlign: 'center', lineHeight: 19 },
    fieldGroup: { marginBottom: 14 },
    label: { color: C.textSec, fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.4 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surfaceAlt,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 12,
      height: 48,
    },
    inputIcon: { marginRight: 8 },
    input: { flex: 1, color: C.text, fontSize: 15 },
    eyeBtn: { padding: 4 },
    submitBtn: {
      backgroundColor: C.brand,
      borderRadius: 12,
      height: 52,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    linkBtn: { marginTop: 16, alignItems: 'center' },
    linkText: { color: C.textSec, fontSize: 14 },
  });
}
