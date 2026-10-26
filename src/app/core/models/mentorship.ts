import { Timestamp } from 'firebase/firestore';

/**
 * Stored at `mentorships/{id}`: a group of students led by one or more mentors (trainers or
 * admins). Admins manage them at `/admin/mentorships` and add students from `/admin/users`;
 * membership is kept on the student, in `users/{uid}.mentorshipIds`, so the rules can check it.
 * Forms and practice evaluations can be assigned to whole mentorships.
 */
export interface Mentorship {
  id: string;
  name: string;
  description: string;
  /** uids of the trainers or admins who lead it. */
  mentorIds: string[];
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`, or null while it has no end date. */
  endDate: string | null;
  /** Inactive mentorships stay for the record but are not offered for new assignments. */
  active: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Most mentorships a student can be in (mirrors `firestore.rules`). */
export const MAX_MENTORSHIPS_PER_STUDENT = 20;

/** Most mentorships a form or evaluation can be assigned to (mirrors `firestore.rules`). */
export const MAX_AUDIENCE_MENTORSHIPS = 50;

/** Something with a student list and an optional mentorship list, like a form or evaluation. */
export interface Audience {
  studentIds: string[];
  mentorshipIds?: string[];
}

/**
 * The students an evaluation or form is assigned to: the ones picked by name plus the members
 * of its mentorships (as `students` lists them now), without repeats.
 */
export function audienceIds(
  audience: Audience,
  students: readonly { uid: string; mentorshipIds?: string[] }[],
): string[] {
  const groups = new Set(audience.mentorshipIds ?? []);
  const ids = new Set(audience.studentIds);
  if (groups.size) {
    for (const s of students) {
      if (s.mentorshipIds?.some((id) => groups.has(id))) {
        ids.add(s.uid);
      }
    }
  }
  return [...ids];
}

/** The uids of a mentorship's students. */
export function membersOf(
  mentorshipId: string,
  students: readonly { uid: string; mentorshipIds?: string[] }[],
): string[] {
  return students.filter((s) => s.mentorshipIds?.includes(mentorshipId)).map((s) => s.uid);
}

/** A `YYYY-MM-DD` date as local midnight (for display), or null if empty or malformed. */
export function dayDate(value: string | null | undefined): Date | null {
  const [y, m, d] = (value ?? '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
