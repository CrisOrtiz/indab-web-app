import { Page } from '@playwright/test';

// Binance is replaced by a fixed series: `base` (100 unless a test asks for gold-like prices)
// before the replay start, then every minute of the k-th 15-minute bar at base + 1 + k, so each step on 15 minutes raises the price by 1 and every
// entry and exit price below is predictable. The start is read off the first request. Replays
// start on a 4-hour bar with gold open, at least an hour before its daily break, so the few
// steps the tests take never cross a closed hour.
const SECONDS: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
};

/** Replaces Binance on `page`; each call starts a new series. */
export async function mockMarket(page: Page, base = 100): Promise<void> {
  // Binance's clock, which evaluations count down by.
  await page.route(/fapi\.binance\.com\/fapi\/v1\/time/, (route) =>
    route.fulfill({
      json: { serverTime: Date.now() },
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  let replayStart = 0;
  return page.route(/binance\.(vision|com)\/(api\/v3|fapi\/v1)\/klines/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const seconds = SECONDS[params.get('interval')!];
    const limit = Number(params.get('limit'));
    // The replay's minutes come forwards from the minute before the start; the history of
    // each timeframe backwards from the start.
    let from: number;
    if (params.has('endTime')) {
      const to = (Number(params.get('endTime')) + 1) / 1000;
      replayStart ||= to;
      from = Math.ceil(to / seconds) * seconds - limit * seconds;
    } else {
      // Like Binance, the first bar is the one opening at or after the start: the next page of a
      // load asks from a millisecond after the last bar it got.
      const start = Number(params.get('startTime')) / 1000;
      from = Math.ceil(start / seconds) * seconds;
      replayStart ||= start + 60;
    }
    const json = Array.from({ length: limit }, (_, i) => {
      const time = from + i * seconds;
      const close = time < replayStart ? base : base + 1 + Math.floor((time - replayStart) / 900);
      return [time * 1000, `${close}`, `${close}`, `${close}`, `${close}`, '1'];
    });
    return route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}

/**
 * Replaces Binance on `page` with prices that wave up and down around `base`, with volume, so
 * indicators have something to show (screenshots); no test reads these prices.
 */
export async function mockWavyMarket(page: Page, base = 4000): Promise<void> {
  await page.route(/binance\.(vision|com)\/(api\/v3|fapi\/v1)\/klines/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const seconds = SECONDS[params.get('interval')!];
    const limit = Number(params.get('limit'));
    const from = params.has('endTime')
      ? Math.ceil((Number(params.get('endTime')) + 1) / 1000 / seconds) * seconds - limit * seconds
      : Math.ceil(Number(params.get('startTime')) / 1000 / seconds) * seconds;
    // Two waves of different lengths, by time, so every timeframe tells the same story.
    const price = (t: number) =>
      base + 30 * Math.sin(t / 40_000) + 8 * Math.sin(t / 7_000) + 3 * Math.sin(t / 1_300);
    const json = Array.from({ length: limit }, (_, i) => {
      const time = from + i * seconds;
      const open = price(time);
      const close = price(time + seconds);
      const swing = Math.abs(close - open) / 2 + 0.6 * Math.sqrt(seconds / 60);
      const high = Math.max(open, close) + swing;
      const low = Math.min(open, close) - swing;
      const volume = 100 + 80 * Math.abs(Math.sin(time / 5_000));
      return [time * 1000, open, high, low, close, volume].map((v, k) => (k ? v.toFixed(2) : v));
    });
    return route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}
