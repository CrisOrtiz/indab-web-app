import { vi } from 'vitest';
import {
  HISTORY_BARS,
  INSTRUMENTS,
  MarketDataService,
  REPLAY_BARS,
  REPLAY_DAYS,
  intervalMs,
  parseKlines,
  randomReplayStart,
  replayStartAt,
  replayWindow,
} from './market-data.service';

const HOUR = 3_600_000;
const gold = INSTRUMENTS[0];

describe('parseKlines', () => {
  it('turns Binance rows into candles with times in seconds', () => {
    expect(parseKlines([[1_700_000_000_000, '1.5', '2', '1', '1.75', '10', 0]])).toEqual([
      { time: 1_700_000_000, open: 1.5, high: 2, low: 1, close: 1.75 },
    ]);
  });
});

describe('randomReplayStart', () => {
  const now = Date.UTC(2026, 9, 1);

  it('leaves room for the history and a full replay, on a 4-hour boundary', () => {
    const first = randomReplayStart(gold, now, () => 0);
    const last = randomReplayStart(gold, now, () => 0.999999);
    expect(first - HISTORY_BARS * 4 * HOUR).toBeGreaterThanOrEqual(gold.listedAt);
    expect(last + REPLAY_DAYS * 24 * HOUR).toBeLessThanOrEqual(now);
    expect(last % (4 * HOUR)).toBe(0);
    expect(randomReplayStart(gold, now, () => 0.5) % (4 * HOUR)).toBe(0);
  });
});

describe('replayStartAt', () => {
  const now = Date.UTC(2026, 9, 1);

  it('starts on the 4-hour bar of the picked date, inside the replay window', () => {
    expect(replayStartAt(gold, Date.UTC(2023, 5, 15), now)).toBe(Date.UTC(2023, 5, 15));
    expect(replayStartAt(gold, Date.UTC(2023, 5, 15, 1), now)).toBe(Date.UTC(2023, 5, 15, 4));
    const { earliest, latest } = replayWindow(gold, now);
    expect(replayStartAt(gold, Date.UTC(2019, 0, 1), now)).toBe(earliest);
    expect(replayStartAt(gold, now, now)).toBe(latest);
    expect(latest + REPLAY_DAYS * 24 * HOUR).toBeLessThanOrEqual(now);
  });
});

describe('intervalMs', () => {
  it('knows the practice timeframes and the daily bars of older sessions', () => {
    expect(intervalMs('3m')).toBe(180_000);
    expect(intervalMs('1d')).toBe(24 * HOUR);
    expect(intervalMs('2w')).toBeNull();
  });
});

describe('MarketDataService', () => {
  const service = new MarketDataService();
  const rows = [[1_700_000_000_000, '1', '2', '0.5', '1.5']];

  afterEach(() => vi.unstubAllGlobals());

  it('loads klines from the public market-data endpoint', async () => {
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(rows)));
    vi.stubGlobal('fetch', fetch);
    const candles = await service.loadCandles('PAXGUSDT', '4h', 123);
    await service.loadCandles('PAXGUSDT', '15m', 456, 150);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get('limit')).toBe('150');
    expect(candles).toHaveLength(1);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin).toBe('https://data-api.binance.vision');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      symbol: 'PAXGUSDT',
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
    expect(await service.loadCandles('PAXGUSDT', '1h', 0)).toHaveLength(1);
    expect(fetch.mock.calls[1][0]).toContain('https://api.binance.com/');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 451 })),
    );
    await expect(service.loadCandles('PAXGUSDT', '1h', 0)).rejects.toThrow('HTTP 451');
  });
});
