import { User } from 'firebase/auth';
import { Firestore, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Enrollment, UserProfile } from '../models/user-profile';

// The Firestore side of `AuthService`, loaded with the Firestore SDK once someone signs in.

/** Creates `users/{uid}` on first sign-in. New users always start as students. */
export async function ensureProfile(
  firestore: Firestore,
  user: User,
  displayName: string,
): Promise<void> {
  const ref = doc(firestore, 'users', user.uid);
  if ((await getDoc(ref)).exists()) {
    return;
  }
  await setDoc(ref, {
    uid: user.uid,
    email: user.email ?? '',
    displayName,
    role: 'student',
    createdAt: serverTimestamp(),
  });
}

/**
 * Listens to the user's profile and enrollment. `ready` resolves after both first load; a
 * denied or failed listener counts as missing data.
 */
export function watchUserData(
  firestore: Firestore,
  uid: string,
  onProfile: (profile: UserProfile | null) => void,
  onEnrollment: (enrollment: Enrollment | null) => void,
): { ready: Promise<void>; unsubscribe: (() => void)[] } {
  const unsubscribe: (() => void)[] = [];
  const watch = <T>(path: string, target: (value: T | null) => void) =>
    new Promise<void>((resolve) => {
      unsubscribe.push(
        onSnapshot(
          doc(firestore, path, uid),
          (snapshot) => {
            target(snapshot.exists() ? (snapshot.data() as T) : null);
            resolve();
          },
          () => {
            target(null);
            resolve();
          },
        ),
      );
    });

  const ready = Promise.all([
    watch<UserProfile>('users', onProfile),
    watch<Enrollment>('enrollments', onEnrollment),
  ]).then(() => undefined);
  return { ready, unsubscribe };
}
