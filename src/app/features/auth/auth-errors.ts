import { FirebaseError } from 'firebase/app';
import { Messages, es } from '../../core/i18n/messages/es';

type AuthErrors = Messages['auth']['errors'];

const keys: Record<string, keyof AuthErrors> = {
  'auth/invalid-credential': 'invalidCredentials',
  // Projects without email enumeration protection (and the Auth emulator) use these instead.
  'auth/wrong-password': 'invalidCredentials',
  'auth/user-not-found': 'invalidCredentials',
  'auth/invalid-email': 'invalidEmail',
  'auth/user-disabled': 'userDisabled',
  'auth/email-already-in-use': 'emailInUse',
  'auth/weak-password': 'weakPassword',
  'auth/too-many-requests': 'tooManyRequests',
  'auth/popup-closed-by-user': 'popupClosed',
  'auth/network-request-failed': 'network',
  // Profile page: linking or changing a password.
  'auth/missing-password': 'invalidCredentials',
  'auth/requires-recent-login': 'recentLogin',
  'auth/credential-already-in-use': 'credentialInUse',
  'auth/provider-already-linked': 'alreadyLinked',
};

/** Maps a Firebase Auth error to a message the user can act on, in `messages`' language. */
export function authErrorMessage(error: unknown, messages: AuthErrors = es.auth.errors): string {
  const key = error instanceof FirebaseError ? keys[error.code] : undefined;
  return messages[key ?? 'unexpected'];
}
