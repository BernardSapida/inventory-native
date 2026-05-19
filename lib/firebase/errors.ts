import { FirebaseError } from 'firebase/app';

export function newOperationId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function isFirebaseError(e: unknown): e is FirebaseError {
  return e instanceof FirebaseError;
}

export function isPermissionError(e: unknown): boolean {
  return isFirebaseError(e) && e.code === 'permission-denied';
}

export function isNotFoundError(e: unknown): boolean {
  return isFirebaseError(e) && e.code === 'not-found';
}

export function isUnavailableError(e: unknown): boolean {
  return isFirebaseError(e) && e.code === 'unavailable';
}

export function isNetworkError(e: unknown): boolean {
  return isFirebaseError(e) && (e.code === 'network-request-failed' || e.code === 'unavailable');
}

export function formatFirebaseError(e: unknown): string {
  if (isFirebaseError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function errorMeta(e: unknown): { error: string; stack?: string } {
  if (e instanceof Error) return { error: e.message, stack: e.stack };
  return { error: String(e) };
}
