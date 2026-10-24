import { Page } from '@playwright/test';

// Binance is replaced by a fixed series: 100 before the replay start, then every minute of the
// k-th 15-minute bar at 101 + k, so each step on 15 minutes raises the price by 1 and every
// entry and exit price below is predictable. The start is read off the first request.
const SECONDS: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
};

/** Replaces Binance on `page`; each call starts a new series. */
export function mockMarket(page: Page): Promise<void> {
  let replayStart = 0;
  return page.route(/binance\.(vision|com)\/api\/v3\/klines/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const seconds = SECONDS[params.get('interval')!];
    const from = Number(params.get('startTime')) / 1000;
    const limit = Number(params.get('limit'));
    replayStart ||= seconds === 60 ? from + 60 : from + 500 * seconds;
    const json = Array.from({ length: limit }, (_, i) => {
      const time = from + i * seconds;
      const close = time < replayStart ? 100 : 101 + Math.floor((time - replayStart) / 900);
      return [time * 1000, `${close}`, `${close}`, `${close}`, `${close}`, '1'];
    });
    return route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}
