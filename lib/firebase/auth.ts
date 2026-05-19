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
  try {
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

export async function setShiftStatus(uid: string, shiftOn: boolean): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, 'users', uid), { shiftOn });
    logger.info({ message: 'Shift status updated', operationId, userId: uid, operation: 'auth.setShiftStatus', shiftOn });
  } catch (err: unknown) {
    logger.error({ message: 'Set shift status failed', operationId, userId: uid, operation: 'auth.setShiftStatus', ...errorMeta(err) });
    throw err;
  }
}
