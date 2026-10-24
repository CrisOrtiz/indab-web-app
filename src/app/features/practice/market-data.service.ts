import { Injectable, inject } from '@angular/core';
import { LoadingService } from '../../core/loading/loading.service';
import { Candle } from '../../core/models/practice';
import { goldClosed, nextGoldOpen } from './market-hours';

export interface Instrument {
  symbol: string;
  label: string;
  /** First day with data on Binance (ms), so random windows never start before it. */
  listedAt: number;
  /** Binance market the klines come from. */
  market: 'spot' | 'futures';
  /** Whether bars are dropped while the real market is closed and when nothing traded. */
  goldHours: boolean;
}

export interface Timeframe {
  interval: string;
  label: string;
  ms: number;
}

// Gold only for now: Binance Futures' XAUUSDT perpetual follows spot XAU/USD with far more volume
// than the PAXG token used before. USD/JPY and NASDAQ need a data source licensed for showing
// prices to students (none is free), so they wait.
export const INSTRUMENTS: Instrument[] = [
  {
    symbol: 'XAUUSDT',
    label: 'Oro (XAU/USD)',
    listedAt: Date.UTC(2026, 0, 6),
    market: 'futures',
    goldHours: true,
  },
];

/** Markets of older sessions and evaluations, still loaded to review them. */
const RETIRED: Instrument[] = [
  {
    symbol: 'PAXGUSDT',
    label: 'Oro (XAU/USD vía PAXG)',
    listedAt: Date.UTC(2020, 9, 1),
    market: 'spot',
    goldHours: false,
  },
];

/** The instrument of `symbol`, current or retired. */
export function findInstrument(symbol: string): Instrument | undefined {
  return [...INSTRUMENTS, ...RETIRED].find((i) => i.symbol === symbol);
}

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

/** One-minute candles fetched per replay chunk (Binance returns up to 1000 per request). */
export const REPLAY_BARS = 1000;
/** Bars of context shown before the replay starts, in every timeframe: enough to zoom out. */
export const HISTORY_BARS = 1000;
/** How far a replay can run: it is fed one-minute candles, a chunk at a time. */
export const REPLAY_DAYS = 30;

/** Most klines one request returns, on both Binance markets. */
const PAGE = 1000;
/** Requests one load may make to skip a closed market (a weekend of minutes is three). */
const MAX_PAGES = 6;

// Binance's public market-data endpoints: free, no API key, CORS enabled. On spot the second
// is the fallback if the first is unreachable from the student's network.
const ENDPOINTS: Record<Instrument['market'], { bases: string[]; path: string }> = {
  spot: {
    bases: ['https://data-api.binance.vision', 'https://api.binance.com'],
    path: '/api/v3/klines',
  },
  futures: { bases: ['https://fapi.binance.com'], path: '/fapi/v1/klines' },
};

/**
 * First and last replay starts (ms): room for the history of the starting timeframe before
 * them and a full replay after.
 */
export function replayWindow(
  instrument: Instrument,
  now = Date.now(),
): { earliest: number; latest: number } {
  const earliest = alignStart(instrument.listedAt + HISTORY_BARS * DEFAULT_TIMEFRAME.ms);
  const latest = Math.max(earliest, now - (REPLAY_DAYS + 1) * 24 * HOUR);
  return { earliest, latest: Math.floor(latest / LONGEST.ms) * LONGEST.ms };
}

/** Picks a random replay start (ms), on a 4-hour boundary, inside `replayWindow`. */
export function randomReplayStart(
  instrument: Instrument,
  now = Date.now(),
  random = Math.random,
): number {
  const { earliest, latest } = replayWindow(instrument, now);
  return whenOpen(instrument, alignStart(earliest + random() * (latest - earliest)), latest);
}

/** The replay start (ms) for a date the student picked, kept inside `replayWindow`. */
export function replayStartAt(instrument: Instrument, date: number, now = Date.now()): number {
  const { earliest, latest } = replayWindow(instrument, now);
  return whenOpen(instrument, Math.max(earliest, alignStart(date)), latest);
}

/** `start`, or the first 4-hour boundary after it with the market open, up to `latest`. */
function whenOpen(instrument: Instrument, start: number, latest: number): number {
  const open = instrument.goldHours ? nextGoldOpen(start, LONGEST.ms) : start;
  return Math.min(latest, open);
}

/** Replays start on a bar of the longest timeframe, so every timeframe lines up. */
function alignStart(time: number): number {
  return Math.ceil(time / LONGEST.ms) * LONGEST.ms;
}

/**
 * Parses Binance klines (`[openTime, open, high, low, close, volume, closeTime, quoteVolume,
 * trades, ...]` with string prices).
 */
export function parseKlines(rows: unknown[][]): Candle[] {
  return rows.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
  }));
}

/**
 * Whether a kline belongs on a chart of `instrument`: with gold hours, bars while spot gold is
 * closed and minutes in which nothing traded (a flat dash on the chart) are left out.
 */
export function keepKline(instrument: Instrument | undefined, row: unknown[]): boolean {
  if (!instrument?.goldHours) {
    return true;
  }
  return !goldClosed(Number(row[0])) && row[8] !== 0;
}

/** Loads historical candles for the replay straight from the browser. */
@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly loading = inject(LoadingService);

  /**
   * `limit` candles from `startTime` on, fewer only when the data runs out. Shows the page
   * loader while they load, unless `background` (the replay fetching its next chunk while the
   * student trades).
   */
  loadCandles(
    symbol: string,
    interval: string,
    startTime: number,
    limit = REPLAY_BARS,
    { background = false } = {},
  ): Promise<Candle[]> {
    const work = this.forward(symbol, interval, startTime, limit);
    return background ? work : this.loading.track(work);
  }

  /** The last `limit` candles that open before `endTime`, with the page loader. */
  loadHistory(symbol: string, interval: string, endTime: number, limit: number): Promise<Candle[]> {
    return this.loading.track(this.backward(symbol, interval, endTime, limit));
  }

  private async forward(
    symbol: string,
    interval: string,
    startTime: number,
    limit: number,
  ): Promise<Candle[]> {
    const instrument = findInstrument(symbol);
    const kept: unknown[][] = [];
    let from = startTime;
    for (let page = 0; page < MAX_PAGES && kept.length < limit; page++) {
      const size = page ? PAGE : Math.min(PAGE, limit);
      const rows = await this.fetchKlines(symbol, interval, { startTime: from, limit: size });
      kept.push(...rows.filter((row) => keepKline(instrument, row)));
      if (rows.length < size) {
        break;
      }
      from = Number(rows.at(-1)![0]) + 1;
    }
    return parseKlines(kept.slice(0, limit));
  }

  private async backward(
    symbol: string,
    interval: string,
    endTime: number,
    limit: number,
  ): Promise<Candle[]> {
    const instrument = findInstrument(symbol);
    const kept: unknown[][] = [];
    let to = endTime - 1;
    for (let page = 0; page < MAX_PAGES && kept.length < limit; page++) {
      const size = page ? PAGE : Math.min(PAGE, limit);
      const rows = await this.fetchKlines(symbol, interval, { endTime: to, limit: size });
      kept.unshift(...rows.filter((row) => keepKline(instrument, row)));
      if (rows.length < size) {
        break;
      }
      to = Number(rows[0][0]) - 1;
    }
    return parseKlines(kept.slice(-limit));
  }

  private async fetchKlines(
    symbol: string,
    interval: string,
    range: { startTime?: number; endTime?: number; limit: number },
  ): Promise<unknown[][]> {
    const params = new URLSearchParams({ symbol, interval });
    for (const [key, value] of Object.entries(range)) {
      params.set(key, String(value));
    }
    const { bases, path } = ENDPOINTS[findInstrument(symbol)?.market ?? 'spot'];
    let lastError: unknown;
    for (const base of bases) {
      try {
        const response = await fetch(`${base}${path}?${params}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
