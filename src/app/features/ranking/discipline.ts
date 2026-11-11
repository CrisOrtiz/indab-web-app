import { PracticeTrade } from '../../core/models/practice';
import { filledTrades } from '../practice/trade-boxes';

/**
 * Habits a trading school marks down, found in a session's trades (Cris, 2026-11-11). Each
 * costs discipline points (`FAULT_PENALTY`) on the trade where it happened.
 */
export const FAULT_KINDS = [
  'removedStop',
  'widenedStop',
  'martingale',
  'averagingDown',
  'revenge',
  'hedging',
  'leftOpen',
  'noTakeProfit',
] as const;
export type FaultKind = (typeof FAULT_KINDS)[number];

/** Discipline points each fault costs. */
export const FAULT_PENALTY: Record<FaultKind, number> = {
  removedStop: 40,
  widenedStop: 25,
  martingale: 15,
  averagingDown: 15,
  revenge: 10,
  hedging: 10,
  leftOpen: 10,
  noTakeProfit: 5,
};

/** Points given back for each trade whose stop was moved to break-even or better. */
export const BREAKEVEN_BONUS = 5;
/** A new trade this soon (market seconds) after a losing one closed is taken in revenge. */
export const REVENGE_SECONDS = 15 * 60;
/** Risking this much more than on the losing trade just before is a martingale. */
export const MARTINGALE_FACTOR = 1.25;

/** One fault, or one good habit (`breakeven`), of the trade at `trade` (1 = first filled). */
export interface DisciplineMark {
  kind: FaultKind | 'breakeven';
  trade: number;
}

const exitOf = (t: PracticeTrade) => t.exitTime ?? Number.POSITIVE_INFINITY;
const isLong = (t: PracticeTrade) => t.side === 'long';

/** Whether `stop` sits on the losing side of the entry (a real stop loss, not a locked gain). */
const lossSide = (t: PracticeTrade, stop: number) =>
  isLong(t) ? stop < t.entryPrice : stop > t.entryPrice;

/**
 * The stop distance a trade really risked: the farther of the stop it was placed with and the
 * last one (a stop widened later risked more); null without a stop loss on the losing side.
 */
export function stopDistance(t: PracticeTrade): number | null {
  const stops = [t.initialStopLoss, t.stopLoss].filter(
    (s): s is number => typeof s === 'number' && lossSide(t, s),
  );
  return stops.length ? Math.max(...stops.map((s) => Math.abs(t.entryPrice - s))) : null;
}

/** USD a trade risked to its stop loss; null without one. */
export function riskUsd(t: PracticeTrade): number | null {
  const distance = stopDistance(t);
  return distance === null || distance === 0 ? null : distance * t.quantity;
}

/**
 * The faults and good habits of a session's trades, numbered as the trade navigator shows
 * them (filled trades in the order they were opened). Only closed trades are judged; an open
 * one can still be fixed. Trades placed before the first stop was recorded (`initialStopLoss`
 * missing) are not checked for a removed or widened stop.
 */
export function disciplineMarks(trades: PracticeTrade[]): DisciplineMark[] {
  const filled = filledTrades(trades);
  const marks: DisciplineMark[] = [];
  filled.forEach((t, i) => {
    if (t.status !== 'closed') {
      return;
    }
    const n = i + 1;
    const add = (kind: DisciplineMark['kind']) => marks.push({ kind, trade: n });
    const initial = t.initialStopLoss;
    const last = t.stopLoss;

    if (typeof initial === 'number' && last === null) {
      add('removedStop');
    } else if (typeof initial === 'number' && typeof last === 'number' && lossSide(t, initial)) {
      const widened = isLong(t) ? last < initial : last > initial;
      if (widened) {
        add('widenedStop');
      }
    }

    // Trades open when this one was filled.
    const before = filled.slice(0, i).filter((o) => o.entryTime <= t.entryTime);
    const alongside = before.filter((o) => exitOf(o) > t.entryTime);
    if (alongside.some((o) => o.side !== t.side)) {
      add('hedging');
    }
    if (
      alongside.some(
        (o) =>
          o.side === t.side &&
          (isLong(t) ? t.entryPrice < o.entryPrice : t.entryPrice > o.entryPrice),
      )
    ) {
      add('averagingDown');
    }

    // The last trade closed before this one was filled, if it lost.
    const lastClosed = before
      .filter((o) => o.status === 'closed' && exitOf(o) <= t.entryTime)
      .sort((a, b) => exitOf(b) - exitOf(a))[0];
    if (lastClosed && (lastClosed.pnl ?? 0) < 0) {
      if (t.entryTime - exitOf(lastClosed) < REVENGE_SECONDS) {
        add('revenge');
      }
      const risked = riskUsd(t);
      const lost = riskUsd(lastClosed);
      const bigger =
        risked !== null && lost !== null
          ? risked > lost * MARTINGALE_FACTOR
          : t.quantity > lastClosed.quantity * MARTINGALE_FACTOR;
      if (bigger) {
        add('martingale');
      }
    }

    if (t.exitReason === 'sessionEnd') {
      add('leftOpen');
    }
    if (t.takeProfit === null) {
      add('noTakeProfit');
    }
    if (
      typeof initial === 'number' &&
      lossSide(t, initial) &&
      typeof last === 'number' &&
      !lossSide(t, last)
    ) {
      add('breakeven');
    }
  });
  return marks;
}

/** The faults among a session's marks (good habits left out). */
export const faultsOf = (marks: DisciplineMark[]) =>
  marks.filter((m): m is DisciplineMark & { kind: FaultKind } => m.kind !== 'breakeven');

/** Discipline: 100 points, less each fault's penalty, plus the break-even bonus, 0 to 100. */
export function disciplinePoints(marks: DisciplineMark[]): number {
  const total = marks.reduce(
    (sum, m) => sum + (m.kind === 'breakeven' ? BREAKEVEN_BONUS : -FAULT_PENALTY[m.kind]),
    100,
  );
  return Math.min(100, Math.max(0, total));
}
