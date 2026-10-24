import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { DeviceSession } from '../../core/models/user-profile';

/** How many sessions `/profile` lists, most recently active first. */
export const MAX_SESSIONS = 20;

/** Sessions not seen for this long are dropped from the list (and deleted). */
export const STALE_DAYS = 90;

/** Signed-in sessions still worth listing: not signed out and seen in the last `STALE_DAYS`. */
export function openSessions(sessions: DeviceSession[], now = Date.now()): DeviceSession[] {
  return sessions.filter((s) => !s.revoked && !isStale(s, now));
}

function isStale(session: DeviceSession, now: number): boolean {
  const seen = session.lastSeen?.toMillis?.();
  return seen !== undefined && now - seen > STALE_DAYS * 86_400_000;
}

/**
 * The browsers a user is signed in on (`users/{uid}/sessions`, recorded by `session-tracker.ts`)
 * and signing them out. Signing out only flags the session: that browser signs itself out when
 * it next sees the flag, as the client SDK cannot revoke another browser's token.
 */
@Injectable({ providedIn: 'root' })
export class SessionsService {
  private readonly firestore = inject(FIRESTORE);

  /** Listens to the user's sessions, newest activity first. Returns the unsubscribe function. */
  watch(
    uid: string,
    next: (sessions: DeviceSession[]) => void,
    error: (e: unknown) => void,
  ): () => void {
    const sessions = query(
      collection(this.firestore, 'users', uid, 'sessions'),
      orderBy('lastSeen', 'desc'),
      limit(MAX_SESSIONS),
    );
    return onSnapshot(
      sessions,
      (snapshot) =>
        next(
          snapshot.docs.map(
            (d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }) as DeviceSession,
          ),
        ),
      error,
    );
  }

  signOut(uid: string, sessionId: string): Promise<void> {
    return updateDoc(doc(this.firestore, 'users', uid, 'sessions', sessionId), { revoked: true });
  }

  async signOutAll(uid: string, sessionIds: string[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    for (const id of sessionIds) {
      batch.update(doc(this.firestore, 'users', uid, 'sessions', id), { revoked: true });
    }
    await batch.commit();
  }

  /**
   * Deletes sessions not seen for `STALE_DAYS` (cleared browsers, old phones). Signed-out ones
   * stay, so a browser that comes back after months still finds its flag and signs out.
   */
  async prune(uid: string, sessions: DeviceSession[], now = Date.now()): Promise<void> {
    const stale = sessions.filter((s) => !s.revoked && isStale(s, now));
    if (!stale.length) {
      return;
    }
    const batch = writeBatch(this.firestore);
    for (const s of stale) {
      batch.delete(doc(this.firestore, 'users', uid, 'sessions', s.id));
    }
    await batch.commit();
  }
}
