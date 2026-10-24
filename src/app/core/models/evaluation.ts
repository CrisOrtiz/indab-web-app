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
  /** Attempts can be started from `opensAt` until `closesAt`. */
  opensAt: Timestamp;
  closesAt: Timestamp;
  studentIds: string[];
  /** Once true, everyone with academy access sees the evaluation's ranking. */
  resultsPublished: boolean;
  createdBy: string;
  createdAt: Timestamp;
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
