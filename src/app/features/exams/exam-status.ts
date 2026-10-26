import {
  Exam,
  ExamGrade,
  ExamSubmission,
  GRACE_MINUTES,
  attemptDeadline,
  bestGrade,
  examWindow,
} from '../../core/models/exam';

export type ExamList = 'pending' | 'upcoming' | 'done';

/** Where a form stands for a student, and what they can do with it. */
export interface StudentExamState {
  list: ExamList;
  action: 'start' | 'continue' | 'view';
  /** Attempts started so far. */
  used: number;
  /** The attempt still being answered, if any. */
  active: ExamSubmission | null;
  /** The attempt number a start would create. */
  nextAttempt: number | null;
  /** The grade that counts, once published. */
  best: ExamGrade | null;
}

/** An attempt is still being answered until its deadline (plus the grace for slow saves). */
export function isActive(exam: Exam, submission: ExamSubmission, now = Date.now()): boolean {
  if (submission.status !== 'inProgress') {
    return false;
  }
  const started = submission.startedAt?.toMillis() ?? now;
  return now < attemptDeadline(exam, started) + GRACE_MINUTES * 60_000;
}

/** How an attempt ended for the student: answering, handed in, or out of time. */
export function attemptStatus(
  exam: Exam,
  submission: ExamSubmission,
  now = Date.now(),
): 'inProgress' | 'submitted' | 'expired' {
  if (submission.status === 'submitted') {
    return 'submitted';
  }
  return isActive(exam, submission, now) ? 'inProgress' : 'expired';
}

export function studentExamState(
  exam: Exam,
  submissions: ExamSubmission[],
  grades: ExamGrade[],
  now = Date.now(),
): StudentExamState {
  const window = examWindow(exam, now);
  const active = submissions.find((s) => isActive(exam, s, now)) ?? null;
  const used = submissions.length;
  const best = bestGrade(grades);
  if (window === 'upcoming') {
    return { list: 'upcoming', action: 'view', used, active: null, nextAttempt: null, best };
  }
  if (active) {
    return { list: 'pending', action: 'continue', used, active, nextAttempt: null, best };
  }
  if (window === 'open' && used < exam.maxAttempts) {
    return { list: 'pending', action: 'start', used, active: null, nextAttempt: used + 1, best };
  }
  return { list: 'done', action: 'view', used, active: null, nextAttempt: null, best };
}
