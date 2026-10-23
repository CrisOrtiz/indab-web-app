import { Injectable } from '@angular/core';
import { Candle } from '../../core/models/practice';

export interface Instrument {
  symbol: string;
  label: string;
  /** First day with data on Binance (ms), so random windows never start before it. */
  listedAt: number;
}

export interface Timeframe {
  interval: string;
  label: string;
  ms: number;
}

// Gold only for now: Binance's PAXG token tracks XAU/USD. USD/JPY and NASDAQ need a data
// source licensed for showing prices to students (none is free), so they wait.
export const INSTRUMENTS: Instrument[] = [
  { symbol: 'PAXGUSDT', label: 'Oro (XAU/USD vía PAXG)', listedAt: Date.UTC(2020, 9, 1) },
];

export const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Timeframes the student can switch between during the practice, as in TradingView. */
export const TIMEFRAMES: Timeframe[] = [
  { interval: '1m', label: '1m', ms: MINUTE },
  { interval: '3m', label: '3m', ms: 3 * MINUTE },
  { interval: '5m', label: '5m', ms: 5 * MINUTE },
  { interval: '15m', label: '15m', ms: 15 * MINUTE },
  { interval: '1h', label: '1h', ms: HOUR },
  { interval: '4h', label: '4h', ms: 4 * HOUR },
];
export const DEFAULT_TIMEFRAME = TIMEFRAMES[3];
/** The longest timeframe: replays start on one of its bars, so every timeframe lines up. */
const LONGEST = TIMEFRAMES.at(-1)!;

/** Length in ms of a Binance interval, including '1d' from older sessions. */
export function intervalMs(interval: string): number | null {
  return interval === '1d'
    ? 24 * HOUR
    : (TIMEFRAMES.find((t) => t.interval === interval)?.ms ?? null);
}

/** Most klines Binance returns per request. */
export const REPLAY_BARS = 1000;
/** Bars of context shown before the replay starts, in every timeframe: enough to zoom out. */
export const HISTORY_BARS = 500;
/** How far a replay can run: it is fed one-minute candles, a chunk at a time. */
export const REPLAY_DAYS = 30;

// Binance's public market-data endpoints: free, no API key, CORS enabled. The second is the
// fallback if the first is unreachable from the student's network.
const ENDPOINTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

/**
 * Picks a random replay start (ms), on a 4-hour boundary, with room for the history before it
 * and a full replay after it.
 */
export function randomReplayStart(
  instrument: Instrument,
  now = Date.now(),
  random = Math.random,
): number {
  const earliest = instrument.listedAt + HISTORY_BARS * LONGEST.ms;
  const latest = now - (REPLAY_DAYS + 1) * 24 * HOUR;
  const start = earliest + random() * Math.max(0, latest - earliest);
  return Math.ceil(start / LONGEST.ms) * LONGEST.ms;
}

/** Parses Binance klines (`[openTime, open, high, low, close, ...]` with string prices). */
export function parseKlines(rows: unknown[][]): Candle[] {
  return rows.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
  }));
}

/** Loads historical candles for the replay straight from the browser. */
@Injectable({ providedIn: 'root' })
export class MarketDataService {
  async loadCandles(
    symbol: string,
    interval: string,
    startTime: number,
    limit = REPLAY_BARS,
  ): Promise<Candle[]> {
    const params = new URLSearchParams({
      symbol,
      interval,
      startTime: String(startTime),
      limit: String(limit),
    });
    let lastError: unknown;
    for (const base of ENDPOINTS) {
      try {
        const response = await fetch(`${base}/api/v3/klines?${params}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return parseKlines(await response.json());
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
