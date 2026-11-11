import { Timestamp } from 'firebase/firestore';
import type { EvaluationNews } from './market-news';

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
  /**
   * How the chart shows economic news during an attempt (`EVALUATION_NEWS`): revealed at their
   * time, impact only, or none. Missing on older evaluations: revealed at their time.
   */
  news?: EvaluationNews;
  /** The INDAB score that passes, 0 to 100 (`passingScoreOf`; missing on older ones: 70). */
  passingScore?: number;
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

/** The score that passes when an evaluation sets none. */
export const DEFAULT_PASSING_SCORE = 70;

/** The INDAB score an evaluation's attempts need to pass. */
export const passingScoreOf = (evaluation: Pick<Evaluation, 'passingScore'> | null | undefined) =>
  evaluation?.passingScore ?? DEFAULT_PASSING_SCORE;

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

/**
 * What the mentor rates on each attempt, from 1 to 5 (Cris, 2026-11-11): only what a person
 * can judge, since risk and stops are scored from the trades.
 */
export const RUBRIC_CRITERIA = ['plan', 'context', 'management', 'emotions', 'journal'] as const;
export type RubricCriterion = (typeof RUBRIC_CRITERIA)[number];
export type RubricScores = Record<RubricCriterion, number>;
/** Criteria of rubrics saved before 2026-11-11, still shown on those. */
export const LEGACY_RUBRIC_CRITERIA = ['risk', 'stops', 'discipline'] as const;
export type AnyRubricCriterion = RubricCriterion | (typeof LEGACY_RUBRIC_CRITERIA)[number];
/** A saved rubric's scores: today's criteria, or the ones it was saved with. */
export type SavedRubricScores = Partial<Record<AnyRubricCriterion, number>>;

/** The criteria a saved rubric has, in the order they are shown. */
export function rubricCriteria(scores: SavedRubricScores): AnyRubricCriterion[] {
  return [...RUBRIC_CRITERIA, ...LEGACY_RUBRIC_CRITERIA].filter(
    (c) => typeof scores[c] === 'number',
  );
}

/**
 * Stored at `evaluations/{id}/rubrics/{uid}`: the mentor's rating of a student's attempt,
 * 1 to 5 per criterion, so the grade weighs judgement and not only luck. Staff write it; the
 * student reads it once the results are published.
 */
export interface EvaluationRubric {
  uid: string;
  scores: SavedRubricScores;
  by: string;
  byName: string;
  updatedAt: Timestamp;
}

/** A rubric's average, 1 to 5, over the criteria it has. */
export function rubricAverage(scores: SavedRubricScores): number {
  const values = rubricCriteria(scores).map((c) => scores[c]!);
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 1;
}

/**
 * Stored at `evaluations/{id}/grades/{uid}`: an attempt's INDAB score, worked out by a staff
 * member's browser (from the attempt's trades and the rubric, which students cannot read) so
 * the students' ranking can show it once the results are published.
 */
export interface EvaluationGrade {
  /** 0 to 100: 25 % result in R, 25 % risk, 15 % discipline, 25 % rubric, 10 % journal. */
  score: number;
  /**
   * Each part, 0 to 100. Grades saved before 2026-11-11 hold `return`, `risk` and `rubric`
   * instead, and no verdict; the first ones with verdicts have no `journal`. Staff opening the
   * results saves them again.
   */
  parts: { result: number; risk: number; discipline: number; rubric: number; journal?: number };
  /** Passed, failed or unrated (too few trades); missing on grades saved before verdicts. */
  verdict?: 'passed' | 'failed' | 'unrated';
  /** Rules that failed the attempt whatever its score. */
  failedBy?: ('stopOut' | 'lossLimit' | 'removedStop')[];
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
