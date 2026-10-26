import { Timestamp } from 'firebase/firestore';

/** single: one right option; multiple: tick every right one; open: written answer graded by staff. */
export type QuestionType = 'single' | 'multiple' | 'trueFalse' | 'open';

export interface ExamQuestion {
  /** Stable id, the key of answers, scores and the answer key. */
  id: string;
  type: QuestionType;
  text: string;
  /** Optional picture by link (no file uploads: Storage needs the Blaze plan). */
  imageUrl: string;
  /** Choices of `single` and `multiple`; empty for `trueFalse` (true, false) and `open`. */
  options: string[];
  points: number;
  /** `multiple` only: points for each right option ticked, minus each wrong one. */
  partial: boolean;
}

/** Who an exam is for: every student with academy access, or the ones in `studentIds`. */
export type ExamAudience = 'all' | 'selected';

/**
 * Stored at `examForms/{id}`: an evaluation form built by a trainer or admin. Its answer key is
 * kept apart in `examKeys/{id}`, readable by staff only (and by students once results with
 * answers are published), so the questions can be shown without the right answers.
 */
export interface Exam {
  id: string;
  title: string;
  description: string;
  totalPoints: number;
  passingPoints: number;
  /** 0 = no time limit. */
  durationMinutes: number;
  maxAttempts: number;
  audience: ExamAudience;
  studentIds: string[];
  /** Attempts can be started from `opensAt` until `closesAt`. */
  opensAt: Timestamp;
  closesAt: Timestamp;
  questions: ExamQuestion[];
  /** Drafts are hidden from students. */
  published: boolean;
  /** Once true, students see their grades. */
  resultsPublished: boolean;
  /** With published results, students also see the right answers. */
  showAnswers: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Stored at `examKeys/{examId}`: indices of the right options per question id. */
export interface ExamKey {
  answers: Record<string, number[]>;
}

export interface ExamAnswer {
  /** Ticked options (trueFalse: 0 = true, 1 = false). */
  choices: number[];
  text: string;
}

export type SubmissionStatus = 'inProgress' | 'submitted';

/** Stored at `examSubmissions/{examId}_{uid}_{attempt}`: a student's attempt, saved as they go. */
export interface ExamSubmission {
  id: string;
  examId: string;
  uid: string;
  userName: string;
  attempt: number;
  status: SubmissionStatus;
  answers: Record<string, ExamAnswer>;
  startedAt: Timestamp;
  submittedAt: Timestamp | null;
}

/** Stored at `examGrades/{submissionId}`: written by staff, shown to the student once published. */
export interface ExamGrade {
  id: string;
  examId: string;
  uid: string;
  attempt: number;
  scores: Record<string, number>;
  comments: Record<string, string>;
  feedback: string;
  total: number;
  passed: boolean;
  gradedBy: string;
  gradedAt: Timestamp;
}

export const MAX_ATTEMPTS = 3;
export const MAX_QUESTIONS = 100;
/** Saves after the time is up still count for this long (slow networks). */
export const GRACE_MINUTES = 2;

export const submissionId = (examId: string, uid: string, attempt: number): string =>
  `${examId}_${uid}_${attempt}`;

export type ExamWindow = 'upcoming' | 'open' | 'closed';

/** Where `now` (ms) falls in the exam's window. */
export function examWindow(exam: Pick<Exam, 'opensAt' | 'closesAt'>, now = Date.now()): ExamWindow {
  if (now < exam.opensAt.toMillis()) {
    return 'upcoming';
  }
  return now < exam.closesAt.toMillis() ? 'open' : 'closed';
}

/** When an attempt must be handed in (ms): its time limit or the window's close. */
export function attemptDeadline(
  exam: Pick<Exam, 'closesAt' | 'durationMinutes'>,
  startedAt: number,
): number {
  const close = exam.closesAt.toMillis();
  return exam.durationMinutes > 0
    ? Math.min(close, startedAt + exam.durationMinutes * 60_000)
    : close;
}

export const pointsSum = (questions: Pick<ExamQuestion, 'points'>[]): number =>
  round(questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0));

/**
 * The points a closed question earns, from the answer key; null for open questions, which
 * staff grade by hand.
 */
export function suggestScore(
  question: ExamQuestion,
  answer: ExamAnswer | undefined,
  key: number[] | undefined,
): number | null {
  if (question.type === 'open') {
    return null;
  }
  const right = new Set(key ?? []);
  const picked = new Set(answer?.choices ?? []);
  if (!right.size || !picked.size) {
    return 0;
  }
  const hits = [...picked].filter((c) => right.has(c)).length;
  const exact = hits === right.size && picked.size === right.size;
  if (question.type !== 'multiple' || !question.partial) {
    return exact ? question.points : 0;
  }
  const misses = picked.size - hits;
  return round(Math.max(0, (hits - misses) / right.size) * question.points);
}

/** The grade that counts for a student: the best of their attempts. */
export function bestGrade<T extends Pick<ExamGrade, 'total' | 'attempt'>>(grades: T[]): T | null {
  return grades.reduce<T | null>(
    (best, g) =>
      !best || g.total > best.total || (g.total === best.total && g.attempt < best.attempt)
        ? g
        : best,
    null,
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
