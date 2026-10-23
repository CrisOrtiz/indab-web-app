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
export type TradeExitReason = 'manual' | 'stopLoss' | 'takeProfit' | 'sessionEnd';

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
}

/**
 * Stored at `practiceSessions/{sessionId}/trades/{id}`. Opened as `open`, then closed once
 * (by hand, stop loss, take profit or the end of the replay) and never edited again.
 */
export interface PracticeTrade {
  id: string;
  uid: string;
  side: TradeSide;
  quantity: number;
  entryPrice: number;
  /** Candle time (seconds) the trade was opened at. */
  entryTime: number;
  stopLoss: number | null;
  takeProfit: number | null;
  status: 'open' | 'closed';
  openedAt?: Timestamp;
  exitPrice?: number;
  exitTime?: number;
  exitReason?: TradeExitReason;
  pnl?: number;
  closedAt?: Timestamp;
}
