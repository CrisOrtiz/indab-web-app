import { PracticeTrade, TradeSide } from '../../core/models/practice';

/**
 * A filled trade as TradingView's long/short position tool draws it: a box from the entry bar to
 * the exit bar, green from the entry to the target and red from the entry to the stop.
 */
export interface TradeBox {
  id: string;
  side: TradeSide;
  /** Entry and exit bar times (seconds); an open trade runs to the last bar. */
  start: number;
  end: number;
  entry: number;
  /** Far edge of the green zone: the take profit, or the exit when it closed in profit. */
  profit: number | null;
  /** Far edge of the red zone: the stop loss, or the exit when it closed at a loss. */
  loss: number | null;
  /** Exit price; null while the trade is open. */
  exit: number | null;
  pnl: number | null;
}

/** The trades a review walks through: those that were filled, in the order they were opened. */
export function filledTrades(trades: PracticeTrade[]): PracticeTrade[] {
  return trades
    .filter((t) => t.status === 'open' || t.status === 'closed')
    .sort((a, b) => a.entryTime - b.entryTime || a.placedTime - b.placedTime);
}

/** The box of a filled trade; `lastTime` closes the box of a trade still open. */
export function tradeBox(trade: PracticeTrade, lastTime: number): TradeBox {
  const closed = trade.status === 'closed' && trade.exitPrice !== undefined;
  const exit = closed ? trade.exitPrice! : null;
  const gain = exit === null ? 0 : (trade.side === 'long' ? 1 : -1) * (exit - trade.entryPrice);
  return {
    id: trade.id,
    side: trade.side,
    start: trade.entryTime,
    end: Math.max(trade.entryTime, closed ? (trade.exitTime ?? lastTime) : lastTime),
    entry: trade.entryPrice,
    // Without a TP or SL, the zone shows how far the price went until the exit.
    profit: trade.takeProfit ?? (gain > 0 ? exit : null),
    loss: trade.stopLoss ?? (gain < 0 ? exit : null),
    exit,
    pnl: closed ? (trade.pnl ?? null) : null,
  };
}
