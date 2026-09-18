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

/**
 * Maps Firebase Auth error codes to friendly, user-facing messages. Shared
 * across sign-in, sign-up, and change-password so a raw string like
 * "Firebase: Error (auth/invalid-credential)." never reaches an alert.
 */
export function authErrorMessage(e: unknown): string {
  const code = isFirebaseError(e) ? e.code : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact an administrator.';
    case 'auth/requires-recent-login':
      return 'For security, please sign out and sign back in before changing your password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose a stronger one.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-up is disabled for this project.';
    default:
      // No recognized Firebase code - if this is an Error we threw ourselves
      // with an already-friendly message, surface it directly rather than
      // masking it with a generic fallback. A real (but unmapped) Firebase
      // error has a truthy `code`, so it still falls through below.
      if (!code && e instanceof Error && e.message) return e.message;
      return 'Something went wrong. Please try again.';
  }
}
