import { Timestamp } from 'firebase/firestore';

/**
 * Stored at `evaluations/{id}`: a timed practice evaluation set up by a trainer or admin.
 * Every assigned student gets one attempt, started while the window is open, on the same
 * market and replay start, and lasting `durationMinutes`. Attempts are practice sessions
 * with the id `{evaluationId}_{uid}`.
 */
export interface Evaluation {
  id: string;
  title: string;
  description: string;
  symbol: string;
  /** Open time (ms) of the first candle every student trades blind. */
  replayStart: number;
  hideDates: boolean;
  startingBalance: number;
  durationMinutes: number;
  /**
   * Market minutes replayed per real minute. Set, the attempt runs by the clock from the moment
   * it starts: it cannot be paused, stepped or sped up, so every screen shows the same candle at
   * the same time. Missing on older evaluations, whose students pick the speed.
   */
  pace?: number;
  /** Attempts can be started from `opensAt` until `closesAt`. */
  opensAt: Timestamp;
  closesAt: Timestamp;
  studentIds: string[];
  /** Mentorships whose students are also assigned (missing on older evaluations). */
  mentorshipIds?: string[];
  /** Once true, everyone with academy access sees the evaluation's ranking. */
  resultsPublished: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Paces staff pick from (market minutes per real minute); the first is the default. */
export const EVALUATION_PACES = [60, 900, 1] as const;
export const DEFAULT_PACE = EVALUATION_PACES[0];

/**
 * Whether students still see an attempt without dates: the evaluation hides them, and its
 * window is open, so someone could still start it. Once it closes, dates come back.
 */
export function datesLocked(evaluation: Evaluation | null, now = Date.now()): boolean {
  return !!evaluation?.hideDates && now < evaluation.closesAt.toMillis();
}

/**
 * Stored at `evaluations/{id}/adjustments/{id}`: something staff did to a student's attempt
 * when it went wrong (a dropped connection, a dead battery), with why. Staff only.
 */
export interface EvaluationAdjustment {
  id: string;
  uid: string;
  studentName: string;
  /** Minutes added to the attempt, or the attempt deleted so the student starts again. */
  kind: 'extraTime' | 'reset';
  minutes: number | null;
  reason: string;
  by: string;
  byName: string;
  at: Timestamp;
}

/** What the mentor rates on each attempt, from 1 to 5. */
export const RUBRIC_CRITERIA = ['plan', 'risk', 'stops', 'context', 'discipline'] as const;
export type RubricCriterion = (typeof RUBRIC_CRITERIA)[number];
export type RubricScores = Record<RubricCriterion, number>;

/**
 * Stored at `evaluations/{id}/rubrics/{uid}`: the mentor's rating of a student's attempt,
 * 1 to 5 per criterion, so the grade weighs judgement and not only luck. Staff write it; the
 * student reads it once the results are published.
 */
export interface EvaluationRubric {
  uid: string;
  scores: RubricScores;
  by: string;
  byName: string;
  updatedAt: Timestamp;
}

/** A rubric's average, 1 to 5. */
export function rubricAverage(scores: RubricScores): number {
  return RUBRIC_CRITERIA.reduce((sum, c) => sum + scores[c], 0) / RUBRIC_CRITERIA.length;
}

/**
 * Stored at `evaluations/{id}/grades/{uid}`: an attempt's INDAB score, worked out by a staff
 * member's browser (from the attempt's trades and the rubric, which students cannot read) so
 * the students' ranking can show it once the results are published.
 */
export interface EvaluationGrade {
  /** 0 to 100: 40 % return, 30 % risk control, 30 % mentor rubric. */
  score: number;
  parts: { return: number; risk: number; rubric: number };
  by: string;
  updatedAt: Timestamp;
}

export type EvaluationWindow = 'upcoming' | 'open' | 'closed';

/** Where `now` (ms) falls in the evaluation's window. */
export function evaluationWindow(evaluation: Evaluation, now = Date.now()): EvaluationWindow {
  if (now < evaluation.opensAt.toMillis()) {
    return 'upcoming';
  }
  return now < evaluation.closesAt.toMillis() ? 'open' : 'closed';
}

/** The practice session id of a student's attempt. */
export const attemptId = (evaluationId: string, uid: string): string => `${evaluationId}_${uid}`;
