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
