import { Injectable } from '@angular/core';
import { Candle } from '../../core/models/practice';
import { findInstrument } from './market-data.service';
import { goldClosed } from './market-hours';

/**
 * Binance USDⓈ-M Futures' public market streams: free, no API key. Kline streams are "market"
 * streams, served under `/market` since Binance split its futures WebSocket URLs (2026).
 */
export const FUTURES_STREAM_URL = 'wss://fstream.binance.com/market/ws/';

/** Binance ends every connection after 24 hours; we reconnect a little before. */
const MAX_CONNECTION_MS = 23 * 60 * 60_000;
/** Waits before reconnecting after a drop, growing up to the last one. */
const RETRY_MS = [1000, 2000, 5000, 10_000, 30_000];

export type LiveFeedStatus = 'connecting' | 'live' | 'reconnecting';

export interface LiveFeedHandlers {
  /** The newest one-minute candle, a few times a second while it forms. */
  candle: (candle: Candle) => void;
  /**
   * The stream (re)connected. Updates sent while it was down are lost, so the page fetches the
   * minutes it missed.
   */
  opened: () => void;
  status: (status: LiveFeedStatus) => void;
}

/** A live feed to stop. */
export interface LiveConnection {
  close(): void;
}

/**
 * The one-minute candle in a Binance kline event, or null for anything else. As with the
 * historical klines, a market with gold hours drops minutes while spot gold is closed and
 * minutes in which nothing traded yet.
 */
export function parseKlineEvent(symbol: string, data: unknown): Candle | null {
  const event = data as { e?: unknown; k?: Record<string, unknown> } | null;
  const k = event?.k;
  if (event?.e !== 'kline' || !k || k['i'] !== '1m') {
    return null;
  }
  const start = Number(k['t']);
  const candle: Candle = {
    time: Math.floor(start / 1000),
    open: Number(k['o']),
    high: Number(k['h']),
    low: Number(k['l']),
    close: Number(k['c']),
    volume: Number(k['v'] ?? 0),
  };
  const prices = [candle.open, candle.high, candle.low, candle.close];
  if (!Number.isFinite(start) || !prices.every((p) => Number.isFinite(p) && p > 0)) {
    return null;
  }
  if (findInstrument(symbol)?.goldHours && (goldClosed(start) || k['n'] === 0)) {
    return null;
  }
  return candle;
}

/**
 * Live one-minute candles of a market straight from Binance's public WebSocket stream, in the
 * browser (no server, $0). Reconnects by itself after a drop and before Binance's 24-hour cut.
 */
@Injectable({ providedIn: 'root' })
export class LiveFeed {
  connect(symbol: string, handlers: LiveFeedHandlers): LiveConnection {
    const url = `${FUTURES_STREAM_URL}${symbol.toLowerCase()}@kline_1m`;
    let socket: WebSocket | null = null;
    let closed = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let renew: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      if (closed) {
        return;
      }
      handlers.status(failures ? 'reconnecting' : 'connecting');
      const ws = new WebSocket(url);
      socket = ws;
      ws.onopen = () => {
        failures = 0;
        handlers.status('live');
        handlers.opened();
        clearTimeout(renew);
        renew = setTimeout(() => ws.close(), MAX_CONNECTION_MS);
      };
      ws.onmessage = (message) => {
        let data: unknown;
        try {
          data = JSON.parse(String(message.data));
        } catch {
          return;
        }
        const candle = parseKlineEvent(symbol, data);
        if (candle) {
          handlers.candle(candle);
        }
      };
      ws.onclose = () => {
        clearTimeout(renew);
        if (closed || socket !== ws) {
          return;
        }
        handlers.status('reconnecting');
        const wait = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)];
        failures++;
        retry = setTimeout(open, wait);
      };
    };

    open();
    return {
      close: () => {
        closed = true;
        clearTimeout(retry);
        clearTimeout(renew);
        socket?.close();
        socket = null;
      },
    };
  }
}
