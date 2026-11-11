import { PracticeTrade, TradeSide } from '../../core/models/practice';
import { REVENGE_SECONDS } from '../ranking/discipline';
import { RISK_ALLOWED } from '../ranking/score';

/**
 * What the practice warns about before an order is sent (Cris, 2026-11-11): only an order
 * that risks more than the allowed share of the account, one without a stop loss and one that
 * turns around right after a losing trade on the other side.
 */
export type OrderWarning = { kind: 'risk'; pct: number } | { kind: 'noStop' } | { kind: 'flip' };

/** The order about to be sent, as the warnings see it. */
export interface WarnedOrder {
  side: TradeSide;
  /** Where it enters: the market or its limit/stop price. */
  entry: number;
  stopLoss: number | null;
  /** Units (ounces). */
  units: number;
}

/**
 * The warnings for `order`, given the account balance, the session's closed trades and the
 * market time now (seconds).
 */
export function orderWarnings(
  order: WarnedOrder,
  balance: number,
  closed: readonly PracticeTrade[],
  now: number,
): OrderWarning[] {
  const warnings: OrderWarning[] = [];
  if (order.stopLoss === null) {
    warnings.push({ kind: 'noStop' });
  } else if (balance > 0) {
    const losing =
      order.side === 'long' ? order.stopLoss < order.entry : order.stopLoss > order.entry;
    const pct = losing ? (Math.abs(order.entry - order.stopLoss) * order.units) / balance : 0;
    // A hair of tolerance so exactly 15 % (rounded prices) does not warn.
    if (pct > RISK_ALLOWED + 1e-9) {
      warnings.push({ kind: 'risk', pct });
    }
  }
  const last = closed
    .filter((t) => t.exitTime != null && t.exitTime <= now)
    .reduce<PracticeTrade | null>(
      (latest, t) => (!latest || t.exitTime! > latest.exitTime! ? t : latest),
      null,
    );
  if (
    last &&
    (last.pnl ?? 0) < 0 &&
    last.side !== order.side &&
    now - last.exitTime! < REVENGE_SECONDS
  ) {
    warnings.push({ kind: 'flip' });
  }
  return warnings;
}
