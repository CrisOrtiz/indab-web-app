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

const MINUTE = 60_000;
export const TIMEFRAMES: Timeframe[] = [
  { interval: '15m', label: '15 minutos', ms: 15 * MINUTE },
  { interval: '1h', label: '1 hora', ms: 60 * MINUTE },
  { interval: '4h', label: '4 horas', ms: 240 * MINUTE },
  { interval: '1d', label: '1 día', ms: 1440 * MINUTE },
];

/** Candles per replay: the first `HISTORY_BARS` are visible context, the rest are replayed. */
export const REPLAY_BARS = 1000;
export const HISTORY_BARS = 150;

// Binance's public market-data endpoints: free, no API key, CORS enabled. The second is the
// fallback if the first is unreachable from the student's network.
const ENDPOINTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

/** Picks a random window start (ms) between the listing date and the most recent full window. */
export function randomWindowStart(
  instrument: Instrument,
  timeframe: Timeframe,
  now = Date.now(),
  random = Math.random,
): number {
  const latest = now - (REPLAY_BARS + 1) * timeframe.ms;
  const start = instrument.listedAt + random() * Math.max(0, latest - instrument.listedAt);
  return Math.floor(start / timeframe.ms) * timeframe.ms;
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
  async loadCandles(symbol: string, interval: string, startTime: number): Promise<Candle[]> {
    const params = new URLSearchParams({
      symbol,
      interval,
      startTime: String(startTime),
      limit: String(REPLAY_BARS),
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
