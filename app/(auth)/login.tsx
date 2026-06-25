import { useAppDialog } from '@/lib/dialog';
import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Button, Spinner } from 'heroui-native';
import { signIn } from '@/lib/firebase/auth';
import { useColors, ColorPalette } from '@/lib/constants';
import BrandLogo from '@/components/BrandLogo';

export default function LoginScreen() {
  const router = useRouter();
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showAlert } = useAppDialog();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignIn() {
    if (!email.trim()) { showAlert('Required', 'Please enter your email.'); return; }
    if (!password.trim()) { showAlert('Required', 'Please enter your password.'); return; }

    setIsLoading(true);
    const error = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      showAlert('Sign in failed', error);
    }
    // Auth gate in _layout.tsx handles redirect on success
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
            Inventory, recipes, forecasting, and smart analysis in one system.
          </Text>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputRow}>
              <Feather name="mail" size={16} color={C.textSec} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor={C.textSec}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <Feather name="lock" size={16} color={C.textSec} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Enter your password"
                placeholderTextColor={C.textSec}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={C.textSec} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sign in button */}
          <TouchableOpacity
            style={[styles.signInBtn, isLoading && styles.signInBtnDisabled]}
            onPress={handleSignIn}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <Spinner size="sm" />
            ) : (
              <Text style={styles.signInBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Navigate to signup */}
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')} style={styles.linkBtn}>
            <Text style={styles.linkText}>Don't have an account? </Text>
            <Text style={[styles.linkText, { color: C.brand }]}>Create one</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    signInBtn: {
      backgroundColor: C.brand,
      borderRadius: 12,
      height: 52,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    signInBtnDisabled: { opacity: 0.6 },
    signInBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    linkBtn: { flexDirection: 'row', justifyContent: 'center' },
    linkText: { color: C.textSec, fontSize: 14 },
  });
}
