import { Timestamp } from 'firebase/firestore';
import { WorkKind } from './notification';

/**
 * Stored at `mentorNotes/{id}`: a mentor's note on a student's practice session, evaluation
 * attempt or form attempt. Admins write on anyone's work; trainers (and admins) who mentor one
 * of the student's mentorships write on its students' work, naming that mentorship. Staff and
 * the student read them.
 */
export interface MentorNote {
  id: string;
  studentId: string;
  kind: WorkKind;
  /** The practice session (free or evaluation attempt) or the form attempt. */
  targetId: string;
  /** The evaluation or form; null for free practice. */
  contextId: string | null;
  /** The mentorship that lets the author write; null for admins outside the student's ones. */
  mentorshipId: string | null;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** Longest note (mirrors `firestore.rules`). */
export const MAX_NOTE_LENGTH = 2000;

/** Where a note goes and what it is about. */
export interface NoteTarget {
  studentId: string;
  kind: WorkKind;
  targetId: string;
  contextId: string | null;
  /** The evaluation's or form's title, shown in the student's notification. */
  title: string;
}
