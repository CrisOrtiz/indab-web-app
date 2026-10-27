import { Injectable, inject } from '@angular/core';
import {
  QueryDocumentSnapshot,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import {
  ACTIVITY_TYPES,
  ActivityType,
  AppNotification,
  DEFAULT_SETTINGS,
  NotificationSettings,
  WorkKind,
  followedSubjects,
  notificationId,
} from '../../core/models/notification';

/** Notifications the bell keeps (newest first). */
export const BELL_SIZE = 30;

/** Writes per batch, under Firestore's 500. */
const BATCH_SIZE = 450;

/** Something a student did that the staff following them may hear of. */
export interface ActivityEvent {
  type: ActivityType;
  kind: WorkKind;
  /** The practice session or form attempt. */
  refId: string;
  /** The evaluation or form; null for free practice. */
  contextId: string | null;
  /** The evaluation's or form's title; empty for free practice. */
  title: string;
}

/** A trainer or admin who follows the student, and the subject that matched. */
export interface Recipient {
  uid: string;
  followKind: string;
  followId: string;
}

/**
 * The bell's notifications (`users/{uid}/notifications`) and what trainers and admins follow.
 * Everything runs in the browser (no Cloud Functions on the free plan): whoever causes an event
 * writes the notification into each recipient's list, and the rules check they may.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  private inbox(uid: string) {
    return collection(this.firestore, 'users', uid, 'notifications');
  }

  private settingsRef(uid: string) {
    return doc(this.firestore, 'users', uid, 'settings', 'notifications');
  }

  private followers(subject: string) {
    const [kind, id] = subject.split('/');
    return collection(this.firestore, 'follows', kind, 'subjects', id, 'followers');
  }

  /** Listens to the user's latest notifications; returns the unsubscribe function. */
  listen(
    uid: string,
    next: (list: AppNotification[]) => void,
    error: () => void = () => undefined,
  ): () => void {
    return onSnapshot(
      query(this.inbox(uid), orderBy('createdAt', 'desc'), limit(BELL_SIZE)),
      (snapshot) =>
        next(
          snapshot.docs.map((d) => ({
            ...(d.data({ serverTimestamps: 'estimate' }) as AppNotification),
            id: d.id,
          })),
        ),
      error,
    );
  }

  async markRead(uid: string, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = writeBatch(this.firestore);
      ids
        .slice(i, i + BATCH_SIZE)
        .forEach((id) => batch.update(doc(this.inbox(uid), id), { read: true }));
      await batch.commit();
    }
  }

  // Trainers and admins

  /** What the user follows; the defaults (nothing followed) when they never saved any. */
  async settings(uid: string): Promise<NotificationSettings> {
    const snapshot = await getDoc(this.settingsRef(uid));
    return { ...DEFAULT_SETTINGS, ...(snapshot.data() as Partial<NotificationSettings>) };
  }

  /**
   * Saves the settings and brings the follower lists in line: follows dropped since `previous`
   * are deleted, the rest carry the chosen activity types (none follows nothing).
   */
  async saveSettings(
    uid: string,
    next: NotificationSettings,
    previous: NotificationSettings,
  ): Promise<void> {
    const types = ACTIVITY_TYPES.filter((t) => next.types.includes(t));
    const keep = types.length ? new Set(followedSubjects(next)) : new Set<string>();
    const writes: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
    for (const subject of new Set([...followedSubjects(previous), ...followedSubjects(next)])) {
      const ref = doc(this.followers(subject), uid);
      writes.push((batch) =>
        keep.has(subject)
          ? batch.set(ref, { types, updatedAt: serverTimestamp() })
          : batch.delete(ref),
      );
    }
    writes.push((batch) =>
      batch.set(this.settingsRef(uid), { ...next, types, updatedAt: serverTimestamp() }),
    );
    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
      const batch = writeBatch(this.firestore);
      writes.slice(i, i + BATCH_SIZE).forEach((write) => write(batch));
      await batch.commit();
    }
  }

  /**
   * Tells students that an evaluation or form was given to them, or that its results are out.
   * Each is sent once (a repeat is refused by the rules and skipped); returns how many went out.
   */
  async notifyStudents(
    type: 'assigned' | 'results',
    kind: 'evaluation' | 'exam',
    item: { id: string; title: string },
    uids: string[],
  ): Promise<number> {
    const me = this.auth.user()?.uid;
    const results = await Promise.allSettled(
      [...new Set(uids)]
        .filter((uid) => uid !== me)
        .map((uid) =>
          setDoc(doc(this.inbox(uid), notificationId(type, item.id)), {
            ...this.from(),
            type,
            kind,
            refId: item.id,
            contextId: item.id,
            title: item.title.slice(0, 120),
            studentId: uid,
          }),
        ),
    );
    return results.filter((r) => r.status === 'fulfilled').length;
  }

  // Students

  /**
   * Tells the trainers and admins who follow the signed-in student (by name, mentorship, the
   * evaluation or form, or everyone) and asked for this activity. Never throws: a notification
   * that cannot go out must not get in the way of the student's work.
   */
  async notifyActivity(event: ActivityEvent): Promise<number> {
    try {
      const recipients = await this.recipients(event);
      const results = await Promise.allSettled(
        recipients.map((r) =>
          setDoc(doc(this.inbox(r.uid), notificationId(event.type, event.refId)), {
            ...this.from(),
            ...event,
            title: event.title.slice(0, 120),
            studentId: this.auth.user()?.uid,
            followKind: r.followKind,
            followId: r.followId,
          }),
        ),
      );
      return results.filter((r) => r.status === 'fulfilled').length;
    } catch {
      return 0;
    }
  }

  /** The staff to tell of `event`: one entry each, with the first subject they follow it by. */
  async recipients(event: ActivityEvent): Promise<Recipient[]> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return [];
    }
    const subjects = [
      `student/${uid}`,
      ...(this.auth.profile()?.mentorshipIds ?? []).map((id) => `mentorship/${id}`),
      ...(event.contextId
        ? [`${event.kind === 'exam' ? 'exam' : 'evaluation'}/${event.contextId}`]
        : []),
      'all/all',
    ];
    const lists = await Promise.all(
      subjects.map((subject) =>
        getDocs(this.followers(subject)).then(
          (s) => s.docs,
          // A list the student may not read (e.g. a mentorship just left) is skipped.
          () => [] as QueryDocumentSnapshot[],
        ),
      ),
    );
    const byUid = new Map<string, Recipient>();
    lists.forEach((docs, i) => {
      const [followKind, followId] = subjects[i].split('/');
      for (const d of docs) {
        const types = (d.data()['types'] as string[] | undefined) ?? [];
        if (d.id !== uid && types.includes(event.type) && !byUid.has(d.id)) {
          byUid.set(d.id, { uid: d.id, followKind, followId });
        }
      }
    });
    return [...byUid.values()];
  }

  /** Who sends it, and when. */
  private from() {
    const user = this.auth.user();
    return {
      actorId: user?.uid ?? '',
      actorName: (this.auth.profile()?.displayName || user?.displayName || user?.email || '').slice(
        0,
        120,
      ),
      read: false,
      createdAt: serverTimestamp(),
    };
  }
}
