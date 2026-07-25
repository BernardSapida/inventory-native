import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';
import { DEFAULT_PERMISSIONS } from '@/lib/types/user';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';
import { logAction, logCurrentUserAction } from './audit';
import { createNotification } from './notifications';
import { useAuthStore } from '@/store/auth';

export async function signUp(
  fullName: string,
  email: string,
  password: string,
  role: 'admin' | 'staff'
): Promise<string | null> {
  const operationId = newOperationId();
  try {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
    const uid = credential.user.uid;

    await setDoc(doc(db, 'users', uid), {
      uid,
      fullName: fullName.trim(),
      email: email.trim(),
      role: role.toLowerCase(),
      isActive: true,
      isArchived: false,
      shiftOn: false,
      phoneNumber: '',
      unitPreference: 'Metric (g/ml)',
      permissions: DEFAULT_PERMISSIONS[role] ?? DEFAULT_PERMISSIONS.staff,
      photoUrl: '',
      createdAt: serverTimestamp(),
    });

    logger.info({ message: 'User registered', operationId, userId: uid, operation: 'auth.signUp', role });
    return null;
  } catch (err: unknown) {
    logger.error({ message: 'Sign up failed', operationId, operation: 'auth.signUp', ...errorMeta(err) });
    return (err as { message?: string }).message ?? 'Registration failed.';
  }
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const operationId = newOperationId();
  try {
    const result = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
    const uid = result.user.uid;

    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      await fbSignOut(auth);
      logger.warn({ message: 'Sign in rejected: user profile not found', operationId, userId: uid, operation: 'auth.signIn' });
      return 'User profile not found.';
    }

    const data = snap.data();
    const role = (data.role ?? '').toLowerCase();
    if (role !== 'admin' && role !== 'staff') {
      await fbSignOut(auth);
      logger.warn({ message: 'Sign in rejected: invalid role', operationId, userId: uid, operation: 'auth.signIn', role });
      return 'Access denied: invalid role.';
    }
    if (!data.isActive) {
      await fbSignOut(auth);
      logger.warn({ message: 'Sign in rejected: inactive account', operationId, userId: uid, operation: 'auth.signIn' });
      return 'This account is inactive. Please contact the admin.';
    }

    // Being signed in IS being "active" now -- there's no separate on/off duty
    // toggle. Mark the user active on login so admins can see who's currently
    // using the app. Cleared again on sign-out.
    await updateDoc(doc(db, 'users', uid), {
      shiftOn: true,
      lastLoginAt: serverTimestamp(),
    });

    // Notify admins when a STAFF member comes online. Deduped by uid, so repeated
    // logins refresh the one unread notice instead of stacking. Fire-and-forget:
    // a failed notification must never block the sign-in.
    if (role === 'staff') {
      const staffName = (data.fullName as string) || (data.email as string) || 'A staff member';
      void createNotification(
        'Staff online',
        `${staffName} logged in and is now active.`,
        'admin',
        'staff_login',
        uid,
      ).catch(() => {
        /* swallowed: logged inside createNotification */
      });
    }

    // Log directly rather than via audit(): the auth store is not populated
    // until after this returns, so audit() would record the actor as "unknown".
    void logAction({
      uid,
      user: (data.fullName as string) || (data.email as string) || email.trim(),
      role,
      action: 'LOGIN',
      module: 'Auth',
      description: 'Signed in on mobile',
    });

    logger.info({ message: 'User signed in', operationId, userId: uid, operation: 'auth.signIn', role });
    return null;
  } catch (err: unknown) {
    logger.error({ message: 'Sign in failed', operationId, operation: 'auth.signIn', ...errorMeta(err) });
    return (err as { message?: string }).message ?? 'Sign in failed.';
  }
}

export async function signOut(): Promise<void> {
  const operationId = newOperationId();
  const uid = auth.currentUser?.uid;
  // Read who is leaving BEFORE any sign-out: the store is cleared right after.
  const current = useAuthStore.getState().user;
  try {
    // Must be awaited BEFORE fbSignOut: once signed out, Firestore rules reject
    // the write. This also clears the "active" flag so the user stops showing as
    // logged in to admins.
    if (uid) {
      await updateDoc(doc(db, 'users', uid), { shiftOn: false });
    }

    // Mirror the login ping: tell admins when a STAFF member goes offline. Must
    // run while still authenticated. Fire-and-forget so it never blocks logout.
    if (uid && current?.role === 'staff') {
      const staffName = current.fullName || current.email || 'A staff member';
      void createNotification(
        'Staff offline',
        `${staffName} logged out.`,
        'admin',
        'staff_logout',
        uid,
      ).catch(() => {
        /* swallowed: logged inside createNotification */
      });
    }

    await logCurrentUserAction('LOGOUT', 'Auth', 'Signed out on mobile');
    await fbSignOut(auth);
    logger.info({ message: 'User signed out', operationId, userId: uid, operation: 'auth.signOut' });
  } catch (err: unknown) {
    logger.error({ message: 'Sign out failed', operationId, userId: uid, operation: 'auth.signOut', ...errorMeta(err) });
    throw err;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<string | null> {
  const operationId = newOperationId();
  const user = auth.currentUser;
  if (!user || !user.email) return 'No authenticated user.';
  try {
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPassword);
    logger.info({ message: 'Password changed', operationId, userId: user.uid, operation: 'auth.changePassword' });
    return null;
  } catch (err: unknown) {
    logger.error({ message: 'Password change failed', operationId, userId: user.uid, operation: 'auth.changePassword', ...errorMeta(err) });
    return (err as { message?: string }).message ?? 'Password change failed.';
  }
}
