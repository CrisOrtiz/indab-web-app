import { FirebaseApp } from 'firebase/app';
import { Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

/**
 * Creates the Firestore instance. Kept in its own module so the Firestore SDK (about 600 kB)
 * is only downloaded once someone signs in, not by every visitor of the public pages.
 */
export function connectFirestore(app: FirebaseApp, useEmulators: boolean): Firestore {
  const firestore = getFirestore(app);
  if (useEmulators) {
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  }
  return firestore;
}
