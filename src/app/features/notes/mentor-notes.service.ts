import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { MentorNote, NoteTarget } from '../../core/models/mentor-note';
import { notificationId } from '../../core/models/notification';
import { UserProfile } from '../../core/models/user-profile';

/** Whether the signed-in user may write notes on a student's work, and under which mentorship. */
export interface NoteAccess {
  canWrite: boolean;
  /** The mentorship they share with the student; null for admins who share none. */
  mentorshipId: string | null;
}

/**
 * Mentors' notes (`mentorNotes`) on a student's practice sessions, evaluation attempts and form
 * attempts. Admins write on anyone's; trainers on the students of the mentorships they lead.
 * A new note also lands in the student's notifications (same batch, see `firestore.rules`).
 */
@Injectable({ providedIn: 'root' })
export class MentorNotesService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  private readonly notes = collection(this.firestore, 'mentorNotes');
  /** The mentorships the signed-in user leads, read once per user. */
  private mine: { uid: string; ids: Promise<string[]> } | null = null;

  /** A piece of work's notes, oldest first. Students only read their own. */
  async forTarget(target: Pick<NoteTarget, 'studentId' | 'targetId'>): Promise<MentorNote[]> {
    const filters = [where('targetId', '==', target.targetId)];
    if (!this.auth.isStaff()) {
      filters.unshift(where('studentId', '==', this.auth.user()?.uid ?? ''));
    }
    const snapshot = await getDocs(query(this.notes, ...filters));
    return snapshot.docs
      .map((d) => ({ ...(d.data({ serverTimestamps: 'estimate' }) as MentorNote), id: d.id }))
      .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
  }

  /** Admins always write; trainers when they lead one of the student's mentorships. */
  async access(studentId: string): Promise<NoteAccess> {
    const uid = this.auth.user()?.uid;
    if (!uid || !this.auth.isStaff() || uid === studentId) {
      return { canWrite: false, mentorshipId: null };
    }
    const [student, mine] = await Promise.all([
      getDoc(doc(this.firestore, 'users', studentId)),
      this.myMentorships(uid),
    ]);
    const theirs = (student.data() as UserProfile | undefined)?.mentorshipIds ?? [];
    const shared = theirs.find((id) => mine.includes(id)) ?? null;
    return { canWrite: this.auth.isAdmin() || shared !== null, mentorshipId: shared };
  }

  /** Writes a note and tells the student, in one batch. */
  async add(target: NoteTarget, text: string, mentorshipId: string | null): Promise<string> {
    const user = this.auth.user();
    const authorName = (this.auth.profile()?.displayName || user?.email || '').slice(0, 120);
    const ref = doc(this.notes);
    const batch = writeBatch(this.firestore);
    batch.set(ref, {
      studentId: target.studentId,
      kind: target.kind,
      targetId: target.targetId,
      contextId: target.contextId,
      mentorshipId,
      text,
      authorId: user?.uid,
      authorName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(
        this.firestore,
        'users',
        target.studentId,
        'notifications',
        notificationId('note', ref.id),
      ),
      {
        type: 'note',
        kind: target.kind,
        refId: target.targetId,
        contextId: target.contextId,
        noteId: ref.id,
        title: target.title.slice(0, 120),
        actorId: user?.uid,
        actorName: authorName,
        studentId: target.studentId,
        read: false,
        createdAt: serverTimestamp(),
      },
    );
    await batch.commit();
    return ref.id;
  }

  edit(id: string, text: string): Promise<void> {
    return updateDoc(doc(this.notes, id), { text, updatedAt: serverTimestamp() });
  }

  remove(id: string): Promise<void> {
    return deleteDoc(doc(this.notes, id));
  }

  private myMentorships(uid: string): Promise<string[]> {
    if (this.mine?.uid !== uid) {
      const ids = getDocs(
        query(collection(this.firestore, 'mentorships'), where('mentorIds', 'array-contains', uid)),
      ).then((s) => s.docs.map((d) => d.id));
      // A failed read is tried again next time.
      ids.catch(() => (this.mine = null));
      this.mine = { uid, ids };
    }
    return this.mine.ids;
  }
}
