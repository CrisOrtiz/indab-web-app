import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { DeviceSession } from '../models/user-profile';

// Records the browser the user is signed in on at `users/{uid}/sessions/{id}`, so `/profile`
// can list them and sign one out. Loaded with the Firestore SDK once someone signs in.

/** This browser's session id per user, kept across reloads. */
const STORAGE_KEY = (uid: string) => `indab.session.${uid}`;

/** How often an open tab refreshes `lastSeen` when it becomes visible again. */
export const REFRESH_MS = 15 * 60_000;

export interface TrackedSession {
  readonly id: string;
  /** Stops listening, e.g. when another user signs in. */
  stop(): void;
  /** Removes this browser from the list: call it before signing out. */
  end(): Promise<void>;
}

/** Names the browser and system from a user agent; empty strings when unknown. */
export function describeDevice(
  userAgent: string,
): Pick<DeviceSession, 'browser' | 'os' | 'mobile'> {
  const browsers: [RegExp, string][] = [
    [/Edg(e|A|iOS)?\//, 'Edge'],
    [/OPR\/|Opera/, 'Opera'],
    [/SamsungBrowser\//, 'Samsung Internet'],
    [/Firefox\/|FxiOS\//, 'Firefox'],
    [/Chrome\/|CriOS\//, 'Chrome'],
    [/Safari\//, 'Safari'],
  ];
  const systems: [RegExp, string][] = [
    [/Windows/, 'Windows'],
    [/Android/, 'Android'],
    [/iPhone|iPad|iPod/, 'iOS'],
    [/CrOS/, 'ChromeOS'],
    [/Mac OS X|Macintosh/, 'macOS'],
    [/Linux/, 'Linux'],
  ];
  const find = (list: [RegExp, string][]) => list.find(([test]) => test.test(userAgent))?.[1] ?? '';
  return {
    browser: find(browsers),
    os: find(systems),
    mobile: /Mobi|Android|iPhone|iPad|iPod/.test(userAgent),
  };
}

function readId(uid: string): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY(uid));
  } catch {
    return null;
  }
}

function writeId(uid: string, id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY(uid), id);
    } else {
      localStorage.removeItem(STORAGE_KEY(uid));
    }
  } catch {
    // Storage blocked: this browser gets a new entry on every visit, pruned from /profile.
  }
}

/**
 * Registers this browser (or refreshes its `lastSeen`) and calls `onRevoked` once if the user
 * signs it out from another device. Failures are ignored: the list is a convenience.
 */
export function trackSession(
  firestore: Firestore,
  uid: string,
  onRevoked: () => void,
): TrackedSession {
  const sessions = collection(firestore, 'users', uid, 'sessions');
  const id = readId(uid) ?? doc(sessions).id;
  writeId(uid, id);
  const ref = doc(sessions, id);

  let stopped = false;
  let revoked = false;
  let lastWrite = 0;
  let unsubscribe: (() => void) | null = null;

  const revoke = () => {
    if (!revoked && !stopped) {
      revoked = true;
      onRevoked();
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastWrite > REFRESH_MS) {
      lastWrite = Date.now();
      updateDoc(ref, { lastSeen: serverTimestamp() }).catch(() => undefined);
    }
  };

  const start = async () => {
    const snapshot = await getDoc(ref);
    if (stopped) {
      return;
    }
    if (snapshot.exists()) {
      if (snapshot.data()['revoked'] === true) {
        return revoke();
      }
      await updateDoc(ref, { lastSeen: serverTimestamp() });
    } else {
      await setDoc(ref, {
        ...describeDevice(navigator.userAgent),
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
        revoked: false,
      });
    }
    lastWrite = Date.now();
    if (stopped) {
      return;
    }
    unsubscribe = onSnapshot(
      ref,
      (current) => current.data()?.['revoked'] === true && revoke(),
      () => undefined,
    );
    document.addEventListener('visibilitychange', onVisible);
  };
  start().catch(() => undefined);

  const stop = () => {
    stopped = true;
    unsubscribe?.();
    document.removeEventListener('visibilitychange', onVisible);
  };

  return {
    id,
    stop,
    async end() {
      stop();
      writeId(uid, null);
      await deleteDoc(ref);
    },
  };
}
