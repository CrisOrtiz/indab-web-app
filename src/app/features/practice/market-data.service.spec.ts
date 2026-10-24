import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LoadingService } from '../../core/loading/loading.service';
import { goldClosed } from './market-hours';
import {
  DEFAULT_TIMEFRAME,
  HISTORY_BARS,
  INSTRUMENTS,
  MarketDataService,
  REPLAY_BARS,
  REPLAY_DAYS,
  findInstrument,
  intervalMs,
  keepKline,
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

describe('keepKline', () => {
  const paxg = findInstrument('PAXGUSDT');
  const tuesday = Date.UTC(2026, 9, 20, 12);
  const saturday = Date.UTC(2026, 9, 24, 12);

  it('drops gold bars while the market is closed and minutes with no trades', () => {
    expect(keepKline(gold, [tuesday, '1', '1', '1', '1', '5', 0, '5', 12])).toBe(true);
    expect(keepKline(gold, [tuesday, '1', '1', '1', '1', '0', 0, '0', 0])).toBe(false);
    expect(keepKline(gold, [saturday, '1', '2', '1', '2', '5', 0, '5', 12])).toBe(false);
  });

  it('keeps every bar of the retired PAXG token, as its sessions were played', () => {
    expect(paxg?.market).toBe('spot');
    expect(keepKline(paxg, [saturday, '1', '1', '1', '1', '0', 0, '0', 0])).toBe(true);
  });
});

describe('randomReplayStart', () => {
  const now = Date.UTC(2026, 9, 1);

  it('leaves room for the history and a full replay, on a 4-hour boundary with gold open', () => {
    const first = randomReplayStart(gold, now, () => 0);
    const last = randomReplayStart(gold, now, () => 0.999999);
    expect(first - HISTORY_BARS * DEFAULT_TIMEFRAME.ms).toBeGreaterThanOrEqual(gold.listedAt);
    expect(last + REPLAY_DAYS * 24 * HOUR).toBeLessThanOrEqual(now);
    for (let r = 0; r < 1; r += 0.01) {
      const start = randomReplayStart(gold, now, () => r);
      expect(start % (4 * HOUR)).toBe(0);
      expect(goldClosed(start), new Date(start).toISOString()).toBe(false);
    }
  });
});

describe('replayStartAt', () => {
  const now = Date.UTC(2026, 9, 1);

  it('starts on the 4-hour bar of the picked date, inside the replay window', () => {
    expect(replayStartAt(gold, Date.UTC(2026, 5, 16), now)).toBe(Date.UTC(2026, 5, 16));
    expect(replayStartAt(gold, Date.UTC(2026, 5, 16, 1), now)).toBe(Date.UTC(2026, 5, 16, 4));
    const { earliest, latest } = replayWindow(gold, now);
    expect(replayStartAt(gold, Date.UTC(2019, 0, 1), now)).toBe(earliest);
    expect(replayStartAt(gold, now, now)).toBe(latest);
    expect(latest + REPLAY_DAYS * 24 * HOUR).toBeLessThanOrEqual(now);
  });

  it('moves a weekend date to the Monday the market opens', () => {
    // Saturday 13 June 2026 -> Monday 15 June, 00:00 UTC (Sunday 20:00 in New York).
    expect(replayStartAt(gold, Date.UTC(2026, 5, 13), now)).toBe(Date.UTC(2026, 5, 15));
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
  let service: MarketDataService;
  beforeEach(() => (service = TestBed.inject(MarketDataService)));
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

  it('loads gold from the futures API, paging past the closed market', async () => {
    const minute = 60_000;
    // Friday 23 October 2026, 20:58 UTC: two minutes before gold closes for the weekend.
    const friday = Date.UTC(2026, 9, 23, 20, 58);
    const fetch = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      const from = Number(params.get('startTime'));
      const limit = Number(params.get('limit'));
      const rows = Array.from({ length: limit }, (_, i) => [from + i * minute, '1', '1', '1', '1']);
      return new Response(JSON.stringify(rows));
    });
    vi.stubGlobal('fetch', fetch);
    const candles = await service.loadCandles('XAUUSDT', '1m', friday, 5);
    expect(new URL(fetch.mock.calls[0][0]).origin + new URL(fetch.mock.calls[0][0]).pathname).toBe(
      'https://fapi.binance.com/fapi/v1/klines',
    );
    // Two minutes on Friday, then Sunday's reopening at 22:00 UTC.
    expect(candles.map((c) => new Date(c.time * 1000).toISOString())).toEqual([
      '2026-10-23T20:58:00.000Z',
      '2026-10-23T20:59:00.000Z',
      '2026-10-25T22:00:00.000Z',
      '2026-10-25T22:01:00.000Z',
      '2026-10-25T22:02:00.000Z',
    ]);
  });

  it('loads the history backwards from the replay start', async () => {
    const hour = 3_600_000;
    // Monday 26 October 2026, 04:00 UTC: the weekend lies just before.
    const monday = Date.UTC(2026, 9, 26, 4);
    const fetch = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      const to = Number(params.get('endTime'));
      const limit = Number(params.get('limit'));
      const last = Math.floor(to / hour) * hour;
      const rows = Array.from({ length: limit }, (_, i) => [
        last - (limit - 1 - i) * hour,
        '1',
        '1',
        '1',
        '1',
      ]);
      return new Response(JSON.stringify(rows));
    });
    vi.stubGlobal('fetch', fetch);
    const candles = await service.loadHistory('XAUUSDT', '1h', monday, 10);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('endTime')).toBe(String(monday - 1));
    const times = candles.map((c) => new Date(c.time * 1000).toISOString());
    expect(times).toHaveLength(10);
    // Sunday 22:00 to Monday 03:00, then Friday's last hours before the close.
    expect(times.at(-1)).toBe('2026-10-26T03:00:00.000Z');
    expect(times.slice(0, 4)).toEqual([
      '2026-10-23T17:00:00.000Z',
      '2026-10-23T18:00:00.000Z',
      '2026-10-23T19:00:00.000Z',
      '2026-10-23T20:00:00.000Z',
    ]);
  });

  it('shows the page loader unless the candles load in the background', async () => {
    let respond!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (respond = resolve))),
    );
    const loading = TestBed.inject(LoadingService);

    const background = service.loadCandles('PAXGUSDT', '1m', 0, REPLAY_BARS, { background: true });
    expect(loading.busy()).toBe(false);
    respond(new Response(JSON.stringify(rows)));
    await background;

    const tracked = service.loadCandles('PAXGUSDT', '1m', 0);
    expect(loading.busy()).toBe(true);
    respond(new Response(JSON.stringify(rows)));
    await tracked;
    expect(loading.busy()).toBe(false);
  });
});
