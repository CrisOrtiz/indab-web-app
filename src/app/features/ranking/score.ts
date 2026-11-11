import { RubricScores, rubricAverage } from '../../core/models/evaluation';
import { PracticeTrade } from '../../core/models/practice';
import { SessionStats, sessionStats } from '../practice/stats';
import { DisciplineMark, disciplineMarks, disciplinePoints, riskUsd } from './discipline';

/**
 * Weights of the INDAB score (Cris, 2026-11-11): result in R, risk control, discipline and the
 * mentor's rubric. The trade journal (planned next) is to take 10 of them.
 */
export const SCORE_WEIGHTS = { result: 0.3, risk: 0.25, discipline: 0.15, rubric: 0.3 } as const;

/** A result of this many R (either way) maps to 100 or 0 points; 0 R is 50. */
export const R_SPAN = 5;
/** Risk per trade up to this share of the account costs nothing; above, 10 points per 1 %. */
export const RISK_ALLOWED = 0.02;
/** Risk of all trades open at once up to this share costs nothing; above, 10 points per 1 %. */
export const OPEN_RISK_ALLOWED = 0.03;
/** Drawdown up to this share costs nothing; above, 2 points per 1 %. */
export const DRAWDOWN_ALLOWED = 0.1;
/** Points lost for each closed trade without a stop loss. */
export const NO_STOP_PENALTY = 20;
/** Losing this share of the starting balance fails the evaluation. */
export const LOSS_LIMIT = 0.05;
/** Fewer closed trades than this leave an attempt unrated. */
export const MIN_TRADES = 2;
/** The score that passes. */
export const PASSING_SCORE = 70;

/** Passed, failed (by score or a rule in `failedBy`), or too few trades to rate. */
export type Verdict = 'passed' | 'failed' | 'unrated';
/** Rules that fail an evaluation whatever the score. */
export type FailRule = 'stopOut' | 'lossLimit' | 'removedStop';

/** The parts of an attempt's INDAB score, each 0 to 100, the weighted total and the verdict. */
export interface IndabScore {
  score: number;
  parts: { result: number; risk: number; discipline: number; rubric: number };
  verdict: Verdict;
  failedBy: FailRule[];
}

/** How an attempt traded, as the score sees it. */
export interface TradingRecord {
  stats: SessionStats;
  /** Sum of each closed trade's P/L over what it risked to its stop. */
  r: number;
  /** Largest share of the account risked by trades open at the same time. */
  maxOpenRiskPct: number | null;
  /** Lowest balance below the start, as a share of it (0 when it never fell below). */
  maxLossPct: number;
  marks: DisciplineMark[];
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/**
 * What the score needs from a session's trades. Each trade's R is its P/L over the USD it
 * risked to its stop (the farther of the first and last one); a trade without a stop counts
 * as if it had risked the allowed 2 % of the balance it was opened with.
 */
export function tradingRecord(trades: PracticeTrade[], startingBalance: number): TradingRecord {
  const stats = sessionStats(trades, startingBalance);
  const closed = trades.filter((t) => t.status === 'closed');
  const balanceBefore = (t: PracticeTrade) =>
    startingBalance +
    closed
      .filter((c) => c !== t && (c.exitTime ?? 0) <= t.entryTime)
      .reduce((sum, c) => sum + (c.pnl ?? 0), 0);

  let r = 0;
  for (const t of closed) {
    const risked = riskUsd(t) ?? RISK_ALLOWED * Math.max(balanceBefore(t), 0);
    if (risked > 0) {
      r += (t.pnl ?? 0) / risked;
    }
  }

  let maxOpenRiskPct: number | null = null;
  for (const t of closed) {
    const before = balanceBefore(t);
    if (before <= 0) {
      continue;
    }
    const open = closed.filter(
      (o) => o.entryTime <= t.entryTime && (o.exitTime ?? Infinity) > t.entryTime,
    );
    const risks = open.map(riskUsd).filter((v): v is number => v !== null);
    if (risks.length) {
      const pct = risks.reduce((sum, v) => sum + v, 0) / before;
      maxOpenRiskPct = Math.max(maxOpenRiskPct ?? 0, pct);
    }
  }

  const lowest = Math.min(...stats.equity.map((p) => p.balance));
  const maxLossPct =
    startingBalance > 0 ? Math.max(0, (startingBalance - lowest) / startingBalance) : 0;

  return { stats, r, maxOpenRiskPct, maxLossPct, marks: disciplineMarks(trades) };
}

/** Result: 50 points at 0 R, 0 at -5 R or worse, 100 at +5 R or better. */
export function resultPoints(r: number): number {
  return clamp(50 + (r / R_SPAN) * 50);
}

/**
 * Risk control: 100 points, less 20 per trade without a stop loss, 10 per 1 % of the account
 * risked above 2 % on the riskiest trade, 10 per 1 % above 3 % by trades open at once and 2
 * per 1 % of drawdown above 10 %. A stop out (Cris's choice) leaves it at 0.
 */
export function riskPoints(record: Pick<TradingRecord, 'stats' | 'maxOpenRiskPct'>): number {
  const { stats } = record;
  if (stats.stoppedOut) {
    return 0;
  }
  const overRisk = Math.max(0, (stats.maxRiskPct ?? 0) - RISK_ALLOWED) * 100;
  const overOpen = Math.max(0, (record.maxOpenRiskPct ?? 0) - OPEN_RISK_ALLOWED) * 100;
  const overDrawdown = Math.max(0, stats.maxDrawdownPct - DRAWDOWN_ALLOWED) * 100;
  return clamp(
    100 -
      NO_STOP_PENALTY * stats.withoutStopLoss -
      10 * overRisk -
      10 * overOpen -
      2 * overDrawdown,
  );
}

/** The mentor's rubric: 0 points for all 1s, 100 for all 5s. */
export function rubricPoints(scores: RubricScores): number {
  return clamp(((rubricAverage(scores) - 1) / 4) * 100);
}

/** The rules an attempt broke that fail it whatever the score. */
export function failRules(record: TradingRecord): FailRule[] {
  return [
    ...(record.stats.stoppedOut ? (['stopOut'] as const) : []),
    // A hair of tolerance so exactly 5 % (rounded balances) does not fail.
    ...(record.maxLossPct >= LOSS_LIMIT + 1e-9 ? (['lossLimit'] as const) : []),
    ...(record.marks.some((m) => m.kind === 'removedStop') ? (['removedStop'] as const) : []),
  ];
}

/** An attempt's INDAB score, from its trades and the mentor's rubric. */
export function indabScore(
  trades: PracticeTrade[],
  startingBalance: number,
  rubric: RubricScores,
): IndabScore {
  const record = tradingRecord(trades, startingBalance);
  const parts = {
    result: oneDecimal(resultPoints(record.r)),
    risk: oneDecimal(riskPoints(record)),
    discipline: oneDecimal(disciplinePoints(record.marks)),
    rubric: oneDecimal(rubricPoints(rubric)),
  };
  const score = oneDecimal(
    SCORE_WEIGHTS.result * parts.result +
      SCORE_WEIGHTS.risk * parts.risk +
      SCORE_WEIGHTS.discipline * parts.discipline +
      SCORE_WEIGHTS.rubric * parts.rubric,
  );
  const failedBy = failRules(record);
  const verdict: Verdict = failedBy.length
    ? 'failed'
    : record.stats.trades < MIN_TRADES
      ? 'unrated'
      : score >= PASSING_SCORE
        ? 'passed'
        : 'failed';
  return { score, parts, verdict, failedBy };
}
