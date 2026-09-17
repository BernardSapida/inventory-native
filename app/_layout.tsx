import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import BrandIcon from '@/components/BrandIcon';

import { Stack, useRouter, useSegments } from 'expo-router';

SplashScreen.preventAutoHideAsync();
import { HeroUINativeProvider } from 'heroui-native';
import { Uniwind } from 'uniwind';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DialogProvider } from '@/lib/dialog';
import 'react-native-reanimated';
import '../global.css';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getUserById } from '@/lib/firebase/users';
import { watchSpoonDefaults } from '@/lib/firebase/settings';
import { useAuthStore } from '@/store/auth';
import { useThemeStore } from '@/store/theme';
import { useColors } from '@/lib/constants';

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { user, isLoading, setUser, setFirebaseUser, setLoading } = useAuthStore();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        try {
          // A pending/rejected/deactivated account is NOT signed out here -
          // the redirect effect below routes it to the account-status screen
          // instead, so the user sees why rather than being silently booted.
          const appUser = await getUserById(fbUser.uid);
          setUser(appUser);
        } catch {
          setUser(null);
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Once signed in, keep the global spoon-conversion table in sync so recipe
  // math on the prepare screens resolves the same densities as the admin web.
  useEffect(() => {
    if (!user) return;
    const unsub = watchSpoonDefaults();
    return unsub;
  }, [user]);

  useEffect(() => {
    if (isLoading) return;

    const inAuth = segments[0] === '(auth)';
    const inAdmin = segments[0] === '(admin)';
    const inStaff = segments[0] === '(staff)';
    const inCamera = segments[0] === 'camera';
    const inAccountStatus = inAuth && segments[1] === 'account-status';
    const inChangePassword = inAuth && segments[1] === 'change-password';
    // login/signup are the only (auth) screens a signed-out user should sit
    // on; account-status/change-password are only valid while signed in, so
    // being signed out while there must still redirect - "already in the
    // (auth) group" isn't enough on its own.
    const inLoginOrSignup = inAuth && (segments[1] === 'login' || segments[1] === 'signup');

    const isApproved = !!user && user.status === 'active' && user.isActive && !user.isArchived;
    const mustChangePassword = isApproved && !!user?.mustChangePassword;

    if (!user) {
      if (!inLoginOrSignup) router.replace('/(auth)/login');
    } else if (!isApproved) {
      if (!inAccountStatus) router.replace('/(auth)/account-status');
    } else if (mustChangePassword) {
      if (!inChangePassword) router.replace('/(auth)/change-password');
    } else if (user.role === 'admin') {
      if (!inAdmin && !inCamera) router.replace('/(admin)');
    } else if (user.role === 'staff') {
      if (!inStaff && !inCamera) router.replace('/(staff)');
    }
  }, [user, isLoading, segments]);

  return null;
}

export default function RootLayout() {
  const { isLoading } = useAuthStore();
  const hydrate = useThemeStore((s) => s.hydrate);
  const isDark = useThemeStore((s) => s.isDark);
  const [showSplash, setShowSplash] = useState(true);

  // Keep heroui-native (uniwind) in sync with the app's manual theme toggle,
  // so overlays like Dialog match in-app dark mode instead of the OS scheme.
  useEffect(() => {
    Uniwind.setTheme(isDark ? 'dark' : 'light');
  }, [isDark]);

  const timerDone = useRef(false);
  const authDone = useRef(false);

  const tryHide = () => {
    if (timerDone.current && authDone.current) {
      SplashScreen.hideAsync();
      setShowSplash(false);
    }
  };

  useEffect(() => {
    hydrate();
    SplashScreen.hideAsync();
    const t = setTimeout(() => { timerDone.current = true; tryHide(); }, 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isLoading) { authDone.current = true; tryHide(); }
  }, [isLoading]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <DialogProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(admin)" />
            <Stack.Screen name="(staff)" />
            <Stack.Screen name="camera" />
          </Stack>
          <AuthGate />
          {showSplash && (
            <View style={styles.splash}>
              <BrandIcon size={104} />
              <Text style={styles.splashText}>SmartStock</Text>
            </View>
          )}
        </DialogProvider>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#151718',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    zIndex: 999,
  },
  splashText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
