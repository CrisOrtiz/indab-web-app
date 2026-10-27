import { Timestamp } from 'firebase/firestore';

/** What a note or a notification is about. */
export type WorkKind = 'practice' | 'evaluation' | 'exam';

/** Student activity a trainer or admin can choose to hear of. */
export type ActivityType = 'practiceFinished' | 'evaluationFinished' | 'examSubmitted';

/**
 * `note`: a mentor left a note on the student's work. `assigned` / `results`: an evaluation or
 * form was given to the student / its results were published. The activity types go to the
 * trainers and admins who follow the student.
 */
export type NotificationType = 'note' | 'assigned' | 'results' | ActivityType;

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  'practiceFinished',
  'evaluationFinished',
  'examSubmitted',
];

/** What a trainer or admin can follow: a student, a mentorship, an evaluation, a form, or 'all'. */
export type FollowKind = 'student' | 'mentorship' | 'evaluation' | 'exam' | 'all';

/**
 * Stored at `users/{uid}/notifications/{type}_{refId}` (`note_{noteId}` for notes), written by
 * whoever caused it: there is no server, so the rules check each event happened and that the
 * sender may tell the owner. The id names the event, so it is sent once.
 */
export interface AppNotification {
  id: string;
  type: NotificationType;
  kind: WorkKind;
  /**
   * The practice session or form attempt (notes, activity), or the evaluation or form
   * (`assigned`, `results`).
   */
  refId: string;
  /** The evaluation or form it belongs to; null for free practice. */
  contextId: string | null;
  /** Notes only: the note's id. */
  noteId?: string;
  /** The evaluation's or form's title (Firestore content, not translated); empty for practice. */
  title: string;
  actorId: string;
  actorName: string;
  /** The student it is about. */
  studentId: string;
  /** Activity only: the subject the owner follows that let it through. */
  followKind?: FollowKind;
  followId?: string;
  read: boolean;
  createdAt: Timestamp | null;
}

/**
 * Stored at `users/{uid}/settings/notifications` for trainers and admins: what they follow and
 * which activity they hear of. Missing means nothing is followed, so nobody gets activity
 * notifications they did not ask for. The follower documents
 * (`follows/{kind}/subjects/{id}/followers/{uid}`) mirror it so students can find whom to tell.
 */
export interface NotificationSettings {
  types: ActivityType[];
  /** Every student. */
  all: boolean;
  studentIds: string[];
  mentorshipIds: string[];
  evaluationIds: string[];
  examIds: string[];
}

/** Most ids per list in the settings (mirrors `firestore.rules`). */
export const MAX_FOLLOWS = 100;

export const DEFAULT_SETTINGS: NotificationSettings = {
  types: [...ACTIVITY_TYPES],
  all: false,
  studentIds: [],
  mentorshipIds: [],
  evaluationIds: [],
  examIds: [],
};

/** Each followed subject as `kind/id`, the path of its follower list. */
export function followedSubjects(settings: NotificationSettings): string[] {
  return [
    ...(settings.all ? ['all/all'] : []),
    ...settings.studentIds.map((id) => `student/${id}`),
    ...settings.mentorshipIds.map((id) => `mentorship/${id}`),
    ...settings.evaluationIds.map((id) => `evaluation/${id}`),
    ...settings.examIds.map((id) => `exam/${id}`),
  ];
}

/** The id of the notification for an event, the same for every recipient. */
export function notificationId(type: NotificationType, refId: string): string {
  return `${type}_${refId}`;
}

/** Where a notification leads: the student's work, or the staff page to review it. */
export function notificationLink(
  n: Pick<AppNotification, 'type' | 'kind' | 'refId' | 'contextId'>,
): { path: string; query?: Record<string, string> } {
  switch (n.type) {
    case 'note':
      return n.kind === 'exam'
        ? { path: `/academy/exams/${n.contextId}` }
        : { path: `/academy/practice/sessions/${n.refId}` };
    case 'assigned':
      return n.kind === 'exam'
        ? { path: `/academy/exams/${n.refId}` }
        : { path: '/academy/practice' };
    case 'results':
      return n.kind === 'exam'
        ? { path: `/academy/exams/${n.refId}` }
        : { path: '/academy/ranking' };
    case 'examSubmitted':
      return { path: `/admin/forms/${n.contextId}`, query: { submission: n.refId } };
    default:
      return { path: `/academy/practice/sessions/${n.refId}` };
  }
}
