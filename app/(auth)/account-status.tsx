import { useColors, ColorPalette } from '@/lib/constants';
import { useAppDialog } from '@/lib/dialog';
import { signOut } from '@/lib/firebase/auth';
import { useAuthStore } from '@/store/auth';
import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Spinner } from 'heroui-native';

export default function AccountStatusScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { user, reset } = useAuthStore();
  const { showAlert } = useAppDialog();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const state =
    user?.status === 'rejected'
      ? {
          icon: 'x-circle' as const,
          title: 'Registration rejected',
          message: 'Your registration was not approved. Contact an administrator if you believe this is a mistake.',
        }
      : user && (user.isArchived || !user.isActive)
        ? {
            icon: 'user-x' as const,
            title: 'Account deactivated',
            message: 'Your account has been deactivated. Contact an administrator to have it restored.',
          }
        : {
            icon: 'clock' as const,
            title: 'Pending approval',
            message: "Your account is waiting for an administrator to approve it. You'll be able to sign in once approved.",
          };

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

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Feather name={state.icon} size={36} color={C.warning} />
        </View>
        <Text style={styles.title}>{state.title}</Text>
        <Text style={styles.message}>{state.message}</Text>

        <TouchableOpacity
          style={[styles.signOutBtn, isSigningOut && styles.signOutBtnDisabled]}
          onPress={handleSignOut}
          disabled={isSigningOut}
          activeOpacity={0.85}
        >
          {isSigningOut ? <Spinner size="sm" /> : <Text style={styles.signOutText}>Sign Out</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24 },
    card: {
      backgroundColor: C.surface,
      borderRadius: 20,
      padding: 28,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.brandSoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 8, textAlign: 'center' },
    message: { color: C.textSec, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    signOutBtn: {
      backgroundColor: C.brand,
      borderRadius: 12,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      alignSelf: 'stretch',
    },
    signOutBtnDisabled: { opacity: 0.6 },
    signOutText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
