import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { AppUser } from '@/lib/types/user';
import { logger } from '@/lib/logger';
import { newOperationId, errorMeta } from './errors';

function toAppUser(data: Record<string, unknown>, uid: string): AppUser {
  return {
    uid,
    email: (data.email as string) ?? '',
    fullName: (data.fullName as string) ?? '',
    role: ((data.role as string) ?? 'staff') as 'admin' | 'staff',
    phoneNumber: (data.phoneNumber as string) ?? '',
    unitPreference: (data.unitPreference as string) ?? 'Metric (g/ml)',
    isActive: (data.isActive as boolean) ?? true,
    shiftOn: (data.shiftOn as boolean) ?? false,
    isArchived: (data.isArchived as boolean) ?? false,
    permissions: (data.permissions as Record<string, boolean>) ?? {},
    createdAt: data.createdAt
      ? (data.createdAt as { toDate: () => Date }).toDate()
      : undefined,
    lastActive: data.lastActive
      ? (data.lastActive as { toDate: () => Date }).toDate()
      : undefined,
    archivedAt: data.archivedAt
      ? (data.archivedAt as { toDate: () => Date }).toDate()
      : undefined,
  };
}

export async function getUserById(uid: string): Promise<AppUser | null> {
  const operationId = newOperationId();
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return toAppUser(snap.data() as Record<string, unknown>, snap.id);
  } catch (err: unknown) {
    logger.error({ message: 'Get user by id failed', operationId, userId: uid, operation: 'users.getUserById', ...errorMeta(err) });
    throw err;
  }
}

export function watchActiveStaff(cb: (users: AppUser[]) => void): () => void {
  const operationId = newOperationId();
  const q = query(
    collection(db, 'users'),
    where('isArchived', '==', false),
    where('role', '==', 'staff')
  );
  return onSnapshot(
    q,
    (snap) => {
      const users = snap.docs.map((d) => toAppUser(d.data() as Record<string, unknown>, d.id));
      cb(users.sort((a, b) => a.fullName.localeCompare(b.fullName)));
    },
    (err) => {
      logger.error({ message: 'watchActiveStaff snapshot error', operationId, operation: 'users.watchActiveStaff', ...errorMeta(err) });
    }
  );
}

export function watchArchivedStaff(cb: (users: AppUser[]) => void): () => void {
  const operationId = newOperationId();
  const q = query(collection(db, 'users'), where('isArchived', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const users = snap.docs.map((d) => toAppUser(d.data() as Record<string, unknown>, d.id));
      cb(users.sort((a, b) => a.fullName.localeCompare(b.fullName)));
    },
    (err) => {
      logger.error({ message: 'watchArchivedStaff snapshot error', operationId, operation: 'users.watchArchivedStaff', ...errorMeta(err) });
    }
  );
}

export async function setUserActiveStatus(uid: string, isActive: boolean): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, 'users', uid), { isActive });
    logger.info({ message: 'User active status updated', operationId, userId: uid, operation: 'users.setUserActiveStatus', isActive });
  } catch (err: unknown) {
    logger.error({ message: 'Set user active status failed', operationId, userId: uid, operation: 'users.setUserActiveStatus', ...errorMeta(err) });
    throw err;
  }
}

export async function archiveStaff(uid: string): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, 'users', uid), {
      isArchived: true,
      isActive: false,
      archivedAt: serverTimestamp(),
    });
    logger.info({ message: 'Staff archived', operationId, userId: uid, operation: 'users.archiveStaff' });
  } catch (err: unknown) {
    logger.error({ message: 'Archive staff failed', operationId, userId: uid, operation: 'users.archiveStaff', ...errorMeta(err) });
    throw err;
  }
}

export async function restoreStaff(uid: string): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, 'users', uid), {
      isArchived: false,
      isActive: true,
      archivedAt: null,
    });
    logger.info({ message: 'Staff restored', operationId, userId: uid, operation: 'users.restoreStaff' });
  } catch (err: unknown) {
    logger.error({ message: 'Restore staff failed', operationId, userId: uid, operation: 'users.restoreStaff', ...errorMeta(err) });
    throw err;
  }
}

export async function updateProfile(
  uid: string,
  updates: { fullName?: string; phoneNumber?: string; unitPreference?: string }
): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, 'users', uid), updates);
    logger.info({ message: 'Profile updated', operationId, userId: uid, operation: 'users.updateProfile' });
  } catch (err: unknown) {
    logger.error({ message: 'Update profile failed', operationId, userId: uid, operation: 'users.updateProfile', ...errorMeta(err) });
    throw err;
  }
}

export async function updatePermissions(
  uid: string,
  permissions: Record<string, boolean>
): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, 'users', uid), { permissions });
    logger.info({ message: 'Permissions updated', operationId, userId: uid, operation: 'users.updatePermissions' });
  } catch (err: unknown) {
    logger.error({ message: 'Update permissions failed', operationId, userId: uid, operation: 'users.updatePermissions', ...errorMeta(err) });
    throw err;
  }
}

export async function deleteUser(uid: string): Promise<void> {
  const operationId = newOperationId();
  try {
    await deleteDoc(doc(db, 'users', uid));
    logger.info({ message: 'User deleted', operationId, userId: uid, operation: 'users.deleteUser' });
  } catch (err: unknown) {
    logger.error({ message: 'Delete user failed', operationId, userId: uid, operation: 'users.deleteUser', ...errorMeta(err) });
    throw err;
  }
}

export async function updateLastActive(uid: string): Promise<void> {
  const operationId = newOperationId();
  try {
    await updateDoc(doc(db, 'users', uid), { lastActive: serverTimestamp() });
  } catch (err: unknown) {
    logger.warn({ message: 'Update last active failed (non-critical)', operationId, userId: uid, operation: 'users.updateLastActive', ...errorMeta(err) });
  }
}
