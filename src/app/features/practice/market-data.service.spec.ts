import { vi } from 'vitest';
import {
  INSTRUMENTS,
  MarketDataService,
  REPLAY_BARS,
  TIMEFRAMES,
  parseKlines,
  randomWindowStart,
} from './market-data.service';

const hour = TIMEFRAMES.find((t) => t.interval === '1h')!;
const btc = INSTRUMENTS[0];

describe('parseKlines', () => {
  it('turns Binance rows into candles with times in seconds', () => {
    expect(parseKlines([[1_700_000_000_000, '1.5', '2', '1', '1.75', '10', 0]])).toEqual([
      { time: 1_700_000_000, open: 1.5, high: 2, low: 1, close: 1.75 },
    ]);
  });
});

describe('randomWindowStart', () => {
  const now = Date.UTC(2026, 9, 1);

  it('stays between the listing date and the last full window, aligned to the timeframe', () => {
    const first = randomWindowStart(btc, hour, now, () => 0);
    const last = randomWindowStart(btc, hour, now, () => 0.999999);
    expect(first).toBeGreaterThanOrEqual(btc.listedAt);
    expect(last + REPLAY_BARS * hour.ms).toBeLessThanOrEqual(now);
    expect(last % hour.ms).toBe(0);
    expect(randomWindowStart(btc, hour, now, () => 0.5) % hour.ms).toBe(0);
  });
});

describe('MarketDataService', () => {
  const service = new MarketDataService();
  const rows = [[1_700_000_000_000, '1', '2', '0.5', '1.5']];

  afterEach(() => vi.unstubAllGlobals());

  it('loads klines from the public market-data endpoint', async () => {
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(rows)));
    vi.stubGlobal('fetch', fetch);
    const candles = await service.loadCandles('ETHUSDT', '4h', 123);
    expect(candles).toHaveLength(1);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin).toBe('https://data-api.binance.vision');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      symbol: 'ETHUSDT',
      interval: '4h',
      startTime: '123',
      limit: String(REPLAY_BARS),
    });
  });

  it('falls back to the second endpoint and fails when both do', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response(JSON.stringify(rows)));
    vi.stubGlobal('fetch', fetch);
    expect(await service.loadCandles('BTCUSDT', '1h', 0)).toHaveLength(1);
    expect(fetch.mock.calls[1][0]).toContain('https://api.binance.com/');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 451 })),
    );
    await expect(service.loadCandles('BTCUSDT', '1h', 0)).rejects.toThrow('HTTP 451');
  });
});
