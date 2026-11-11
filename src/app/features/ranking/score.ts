import {
  DEFAULT_PASSING_SCORE,
  JOURNAL_SCALE_MAX,
  SavedRubricScores,
  rubricAverage,
} from '../../core/models/evaluation';
import { PracticeTrade } from '../../core/models/practice';
import { SessionStats, sessionStats } from '../practice/stats';
import { DisciplineMark, disciplineMarks, disciplinePoints, riskUsd } from './discipline';

/**
 * Weights of the INDAB score (Cris, 2026-11-11): result in R, risk control, discipline, the
 * mentor's rubric and the trade journal.
 */
export const SCORE_WEIGHTS = {
  result: 0.25,
  risk: 0.25,
  discipline: 0.15,
  rubric: 0.25,
  journal: 0.1,
} as const;

/** A result of this many R (either way) maps to 100 or 0 points; 0 R is 50. */
export const R_SPAN = 5;
/**
 * Risk per trade up to this share of the account costs nothing; above, `OVER_RISK_PENALTY`
 * points per 1 % (Cris, 2026-11-11: 15 %, the practice warns before an order risks more).
 */
export const RISK_ALLOWED = 0.15;
/** Risk of all trades open at once up to this share costs nothing; above, the same per 1 %. */
export const OPEN_RISK_ALLOWED = 0.15;
/** Risk points lost per 1 % of the account risked above the allowed share (Cris's soft pick). */
export const OVER_RISK_PENALTY = 5;
/** Drawdown up to this share costs nothing; above, 2 points per 1 %. */
export const DRAWDOWN_ALLOWED = 0.1;
/** Points lost for each closed trade without a stop loss. */
export const NO_STOP_PENALTY = 20;
/**
 * Losing this share of the starting balance costs `DEEP_LOSS_PENALTY` risk points; it does not
 * fail the attempt, so the student can still recover (Cris, 2026-11-11).
 */
export const DEEP_LOSS = 0.4;
export const DEEP_LOSS_PENALTY = 40;
/** Fewer closed trades than this leave an attempt unrated (Cris, 2026-11-11: at least 1). */
export const MIN_TRADES = 1;
/** A journal entry this long (characters, trimmed) counts as written. */
export const JOURNAL_MIN_LENGTH = 10;

/** Passed, failed (by score or a rule in `failedBy`), or too few trades to rate. */
export type Verdict = 'passed' | 'failed' | 'unrated';
/**
 * Rules that fail an evaluation whatever the score: only a stop out since 2026-11-11 (its score
 * and every detail are kept). Grades saved before may also name `lossLimit` or `removedStop`.
 */
export type FailRule = 'stopOut' | 'lossLimit' | 'removedStop';

/** The parts of an attempt's INDAB score, each 0 to 100, the weighted total and the verdict. */
export interface IndabScore {
  score: number;
  parts: { result: number; risk: number; discipline: number; rubric: number; journal: number };
  verdict: Verdict;
  failedBy: FailRule[];
}

/** How an attempt traded, as the score sees it. */
export interface TradingRecord {
  stats: SessionStats;
  /** Sum of each closed trade's P/L over what it risked to its stop. */
  r: number;
  /**
   * Each trade's risk above the allowed share of the account, added up (Cris, 2026-11-11:
   * every trade over 15 % costs, not only the worst); 0.05 is 5 % over in all.
   */
  overRiskPct: number;
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
 * as if it had risked the allowed 15 % of the balance it was opened with.
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

  let overRiskPct = 0;
  let maxOpenRiskPct: number | null = null;
  for (const t of closed) {
    const before = balanceBefore(t);
    if (before <= 0) {
      continue;
    }
    const own = riskUsd(t);
    if (own !== null) {
      overRiskPct += Math.max(0, own / before - RISK_ALLOWED);
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

  return { stats, r, overRiskPct, maxOpenRiskPct, maxLossPct, marks: disciplineMarks(trades) };
}

/** Result: 50 points at 0 R, 0 at -5 R or worse, 100 at +5 R or better. */
export function resultPoints(r: number): number {
  return clamp(50 + (r / R_SPAN) * 50);
}

/**
 * Risk control: 100 points, less 20 per trade without a stop loss, 5 per 1 % of the account
 * risked above 15 % on each trade, 5 per 1 % above 15 % by trades open at once, 2
 * per 1 % of drawdown above 10 % and 40 once the account lost 40 % of its start. A stop out
 * (Cris's choice) leaves it at 0.
 */
export function riskPoints(
  record: Pick<TradingRecord, 'stats' | 'overRiskPct' | 'maxOpenRiskPct'> & {
    maxLossPct?: number;
  },
): number {
  const { stats } = record;
  if (stats.stoppedOut) {
    return 0;
  }
  const overRisk = record.overRiskPct * 100;
  const overOpen = Math.max(0, (record.maxOpenRiskPct ?? 0) - OPEN_RISK_ALLOWED) * 100;
  const overDrawdown = Math.max(0, stats.maxDrawdownPct - DRAWDOWN_ALLOWED) * 100;
  return clamp(
    100 -
      NO_STOP_PENALTY * stats.withoutStopLoss -
      OVER_RISK_PENALTY * overRisk -
      OVER_RISK_PENALTY * overOpen -
      2 * overDrawdown -
      // A hair of tolerance so exactly 40 % (rounded balances) is not a deep loss.
      ((record.maxLossPct ?? 0) >= DEEP_LOSS + 1e-9 ? DEEP_LOSS_PENALTY : 0),
  );
}

/**
 * Journal, 0 to 100 (Cris, 2026-11-11): 0 without entries; otherwise the mentor's 1-10 for its
 * quality (`journalScore`, 10 points each), times the share of closed trades with a reason
 * written, so the trades left without one still count as 0.
 */
export function journalPoints(trades: PracticeTrade[], journalScore?: number | null): number {
  const closed = trades.filter((t) => t.status === 'closed');
  if (!closed.length) {
    return 0;
  }
  const written = closed.filter((t) => hasJournal(t)).length;
  const quality = Math.min(JOURNAL_SCALE_MAX, Math.max(0, journalScore ?? 0)) / JOURNAL_SCALE_MAX;
  return (written / closed.length) * quality * 100;
}

/** Whether a trade has a journal entry long enough to count. */
export const hasJournal = (t: PracticeTrade) =>
  (t.journal ?? '').trim().length >= JOURNAL_MIN_LENGTH;

/** The mentor's rubric: 0 points for all 1s, 100 for all 5s (the journal's 1-10 apart). */
export function rubricPoints(scores: SavedRubricScores): number {
  return clamp(((rubricAverage(scores) - 1) / 4) * 100);
}

/**
 * The rules an attempt broke that fail it whatever the score: a stop out (Cris, 2026-11-11).
 * A deep loss and a removed stop loss cost points instead (risk and discipline).
 */
export function failRules(record: TradingRecord): FailRule[] {
  return record.stats.stoppedOut ? ['stopOut'] : [];
}

/** An attempt's INDAB score, from its trades and the mentor's rubric. */
export function indabScore(
  trades: PracticeTrade[],
  startingBalance: number,
  rubric: SavedRubricScores,
  passingScore = DEFAULT_PASSING_SCORE,
): IndabScore {
  const record = tradingRecord(trades, startingBalance);
  const parts = {
    result: oneDecimal(resultPoints(record.r)),
    risk: oneDecimal(riskPoints(record)),
    discipline: oneDecimal(disciplinePoints(record.marks)),
    rubric: oneDecimal(rubricPoints(rubric)),
    journal: oneDecimal(journalPoints(trades, rubric.journal)),
  };
  const score = oneDecimal(
    SCORE_WEIGHTS.result * parts.result +
      SCORE_WEIGHTS.risk * parts.risk +
      SCORE_WEIGHTS.discipline * parts.discipline +
      SCORE_WEIGHTS.rubric * parts.rubric +
      SCORE_WEIGHTS.journal * parts.journal,
  );
  const failedBy = failRules(record);
  const verdict: Verdict = failedBy.length
    ? 'failed'
    : record.stats.trades < MIN_TRADES
      ? 'unrated'
      : score >= passingScore
        ? 'passed'
        : 'failed';
  return { score, parts, verdict, failedBy };
}
