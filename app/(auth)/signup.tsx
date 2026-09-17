import { useColors, ColorPalette } from '@/lib/constants';
import { useAppDialog } from '@/lib/dialog';
import { signUp } from '@/lib/firebase/auth';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import BrandLogo from '@/components/BrandLogo';

export default function SignupScreen() {
  const router = useRouter();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showAlert } = useAppDialog();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignup() {
    if (!fullName.trim()) { showAlert('Required', 'Please enter your full name.'); return; }
    if (!email.trim()) { showAlert('Required', 'Please enter your email.'); return; }
    if (password.trim().length < 6) {
      showAlert('Password too short', 'Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    const error = await signUp(fullName, email, password);
    setIsLoading(false);

    if (error) {
      showAlert('Registration failed', error);
      return;
    }

    showAlert(
      'Account created',
      "Your account now needs admin approval before you can sign in.",
      [{ text: 'OK', onPress: () => null }],
    );
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
          {/* Logo placeholder */}
          <View style={styles.logoBox}>
            <BrandLogo size={48} color={C.brand} />
            <Text style={styles.appName}>SmartStock</Text>
          </View>

          <Text style={styles.tagline}>
            Join SmartStock to manage inventory and more.
          </Text>

          {/* Full name */}
          <Field label="Full Name" icon="user" C={C} styles={styles}>
            <TextInput
              style={styles.input}
              placeholder="Enter full name"
              placeholderTextColor={C.textSec}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </Field>

          {/* Email */}
          <Field label="Email" icon="mail" C={C} styles={styles}>
            <TextInput
              style={styles.input}
              placeholder="Enter email"
              placeholderTextColor={C.textSec}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </Field>

          {/* Password */}
          <Field label="Password" icon="lock" C={C} styles={styles}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Create a password (min 6 chars)"
              placeholderTextColor={C.textSec}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={C.textSec} />
            </TouchableOpacity>
          </Field>

          {/* Create account button */}
          <TouchableOpacity
            style={[styles.createBtn, isLoading && styles.createBtnDisabled]}
            onPress={handleSignup}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <Spinner size="sm" />
            ) : (
              <Text style={styles.createBtnText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Navigate to sign in */}
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>Have an account? </Text>
            <Text style={[styles.linkText, { color: C.brand }]}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type SignupStyles = ReturnType<typeof makeStyles>;

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
  styles: SignupStyles;
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
    logoBox: { alignItems: 'center', marginBottom: 12 },
    appName: { fontSize: 28, fontWeight: '700', color: C.text, marginTop: 8 },
    tagline: { color: C.textSec, fontSize: 13, textAlign: 'center', marginBottom: 28, lineHeight: 19 },
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
    createBtn: {
      backgroundColor: C.brand,
      borderRadius: 12,
      height: 52,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    createBtnDisabled: { opacity: 0.6 },
    createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    linkBtn: { flexDirection: 'row', justifyContent: 'center' },
    linkText: { color: C.textSec, fontSize: 14 },
  });
}
