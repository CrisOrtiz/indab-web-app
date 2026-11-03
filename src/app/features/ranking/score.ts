import { RubricScores, rubricAverage } from '../../core/models/evaluation';
import { SessionStats } from '../practice/stats';

/** Weights of the INDAB score (Cris, 2026-11-03): return, risk control, mentor rubric. */
export const SCORE_WEIGHTS = { return: 0.4, risk: 0.3, rubric: 0.3 } as const;

/** A return of this much (either way) maps to 100 or 0 points; 0 % is 50. */
export const RETURN_SPAN = 0.2;
/** Risk per trade up to this share of the account costs nothing; above, 10 points per 1 %. */
export const RISK_ALLOWED = 0.02;
/** Drawdown up to this share costs nothing; above, 2 points per 1 %. */
export const DRAWDOWN_ALLOWED = 0.1;
/** Points lost for each closed trade without a stop loss. */
export const NO_STOP_PENALTY = 20;

/** The parts of an attempt's INDAB score, each 0 to 100, and the weighted total. */
export interface IndabScore {
  score: number;
  parts: { return: number; risk: number; rubric: number };
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** Return: 50 points at break-even, 0 at -20 % or worse, 100 at +20 % or better. */
export function returnPoints(ret: number): number {
  return clamp(50 + (ret / RETURN_SPAN) * 50);
}

/**
 * Risk control: 100 points, less 20 per trade without a stop loss, 10 per 1 % of the account
 * risked above 2 % on the riskiest trade and 2 per 1 % of drawdown above 10 %. A stop out
 * (Cris's choice) leaves it at 0.
 */
export function riskPoints(stats: SessionStats): number {
  if (stats.stoppedOut) {
    return 0;
  }
  const overRisk = Math.max(0, (stats.maxRiskPct ?? 0) - RISK_ALLOWED) * 100;
  const overDrawdown = Math.max(0, stats.maxDrawdownPct - DRAWDOWN_ALLOWED) * 100;
  return clamp(100 - NO_STOP_PENALTY * stats.withoutStopLoss - 10 * overRisk - 2 * overDrawdown);
}

/** The mentor's rubric: 0 points for all 1s, 100 for all 5s. */
export function rubricPoints(scores: RubricScores): number {
  return clamp(((rubricAverage(scores) - 1) / 4) * 100);
}

/** An attempt's INDAB score, from its return, its trades' statistics and the mentor's rubric. */
export function indabScore(ret: number, stats: SessionStats, rubric: RubricScores): IndabScore {
  const parts = {
    return: oneDecimal(returnPoints(ret)),
    risk: oneDecimal(riskPoints(stats)),
    rubric: oneDecimal(rubricPoints(rubric)),
  };
  return {
    score: oneDecimal(
      SCORE_WEIGHTS.return * parts.return +
        SCORE_WEIGHTS.risk * parts.risk +
        SCORE_WEIGHTS.rubric * parts.rubric,
    ),
    parts,
  };
}
