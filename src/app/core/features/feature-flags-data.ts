import { Firestore, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { FeatureKey, FeatureMode, readFlags } from '../models/feature-flags';

// The Firestore side of `FeatureFlags`, loaded with the Firestore SDK once someone signs in.

/** `config/features`: one document for the whole site. */
export const featuresRef = (firestore: Firestore) => doc(firestore, 'config', 'features');

/**
 * Listens to the flags (one read, then one per change). A missing or unreadable document counts
 * as every feature on. Returns the unsubscribe function.
 */
export function watchFlags(
  firestore: Firestore,
  onFlags: (flags: Partial<Record<FeatureKey, FeatureMode>>) => void,
  onError: () => void,
): () => void {
  return onSnapshot(
    featuresRef(firestore),
    (snapshot) => onFlags(readFlags(snapshot.data())),
    onError,
  );
}

/** Sets one feature's mode; the other flags are kept (merge). */
export function saveFlag(
  firestore: Firestore,
  key: FeatureKey,
  mode: FeatureMode,
  uid: string,
): Promise<void> {
  return setDoc(
    featuresRef(firestore),
    { flags: { [key]: mode }, updatedAt: serverTimestamp(), updatedBy: uid },
    { merge: true },
  );
}
