import { Timestamp } from 'firebase/firestore';

/** One OHLC bar. `time` is the bar's open time in seconds (UTC), as lightweight-charts expects. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type TradeSide = 'long' | 'short';
/** `market` fills at once; `limit` and `stop` wait in the book until a candle reaches `orderPrice`. */
export type OrderType = 'market' | 'limit' | 'stop';
export type TradeStatus = 'pending' | 'open' | 'closed' | 'cancelled';
export type TradeExitReason = 'manual' | 'stopLoss' | 'takeProfit' | 'stopOut' | 'sessionEnd';

/**
 * Stored at `practiceSessions/{id}`: one chart replay by one student. Created by the student
 * when the replay starts; the summary fields (`balance`, `pnl`, `tradeCount`) are refreshed as
 * trades close, until the session is `finished`. Admins read every session.
 */
export interface PracticeSession {
  id: string;
  uid: string;
  /** Display name or email at the time, so the admin list needs no user lookup. */
  userName: string;
  symbol: string;
  interval: string;
  /** Open time (ms) of the first candle the student had to trade blind. */
  replayStart: number;
  startingBalance: number;
  balance: number;
  pnl: number;
  tradeCount: number;
  status: 'active' | 'finished';
  startedAt: Timestamp;
  endedAt?: Timestamp;
  /**
   * The evaluation this session is an attempt at (its id is `{evaluationId}_{uid}`), or null
   * for free practice. Sessions logged before evaluations existed have no value.
   */
  evaluationId?: string | null;
  /** An evaluation attempt's time limit, copied from the evaluation. */
  durationMinutes?: number;
}

/**
 * Stored at `practiceSessions/{sessionId}/trades/{id}`. A market order starts `open`; a limit
 * or stop order starts `pending` and becomes `open` when a candle reaches its price, or
 * `cancelled`. While pending or open only the stop loss, take profit (and a pending order's
 * price) can move. An open trade is closed once (by hand, stop loss, take profit or the end
 * of the replay) and never edited again.
 */
export interface PracticeTrade {
  id: string;
  uid: string;
  side: TradeSide;
  orderType: OrderType;
  /** Limit or stop price; null for market orders. */
  orderPrice: number | null;
  /** Candle time (seconds) the order was placed at. */
  placedTime: number;
  quantity: number;
  /** Fill price; for a pending order, its order price. */
  entryPrice: number;
  /** Candle time (seconds) the trade was filled at; for a pending order, `placedTime`. */
  entryTime: number;
  stopLoss: number | null;
  takeProfit: number | null;
  status: TradeStatus;
  openedAt?: Timestamp;
  filledAt?: Timestamp;
  exitPrice?: number;
  exitTime?: number;
  exitReason?: TradeExitReason;
  pnl?: number;
  closedAt?: Timestamp;
}
