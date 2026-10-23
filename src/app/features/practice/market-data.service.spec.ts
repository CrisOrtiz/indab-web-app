import { vi } from 'vitest';
import { MarketDataService, REPLAY_BARS, filesForWindow } from './market-data.service';

const file = (name: string, count: number) => ({ file: name, count, from: 0, to: 0 });

describe('filesForWindow', () => {
  const files = [file('2024', 600), file('2025', 600), file('2026', 600)];

  it('slices the files that overlap the window', () => {
    expect(filesForWindow(files, 100, 300)).toEqual([{ file: '2024', from: 100, to: 400 }]);
    expect(filesForWindow(files, 500, 1000)).toEqual([
      { file: '2024', from: 500, to: 600 },
      { file: '2025', from: 0, to: 600 },
      { file: '2026', from: 0, to: 300 },
    ]);
    expect(filesForWindow(files, 1700, 100)).toEqual([{ file: '2026', from: 500, to: 600 }]);
  });
});

describe('MarketDataService', () => {
  const row = (t: number) => [t, 1, 2, 0.5, 1.5];
  const data: Record<string, unknown> = {
    '/market-data/index.json': {
      source: 'test',
      generatedAt: '',
      instruments: {
        USDJPY: {
          '1h': [file('USDJPY/1h/2025.json', 700), file('USDJPY/1h/2026.json', 700)],
          '1d': [file('USDJPY/1d/all.json', 3)],
        },
      },
    },
    '/market-data/USDJPY/1h/2025.json': Array.from({ length: 700 }, (_, i) => row(i)),
    '/market-data/USDJPY/1h/2026.json': Array.from({ length: 700 }, (_, i) => row(700 + i)),
    '/market-data/USDJPY/1d/all.json': [row(1), row(2), row(3)],
  };
  let fetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetch = vi.fn(async (url: string) =>
      url in data ? new Response(JSON.stringify(data[url])) : new Response('', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads a random window that can span two files', async () => {
    const service = new MarketDataService();
    const candles = await service.loadRandomWindow('USDJPY', '1h', () => 0.5);
    expect(candles).toHaveLength(REPLAY_BARS);
    // 400 of 1400 - 1000 + 1 possible starts.
    expect(candles[0]).toEqual({ time: 200, open: 1, high: 2, low: 0.5, close: 1.5 });
    expect(candles.at(-1)?.time).toBe(1199);
    expect(fetch).toHaveBeenCalledTimes(3);

    // The index is downloaded once.
    await service.loadRandomWindow('USDJPY', '1h', () => 0);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('index.json'))).toHaveLength(1);
  });

  it('returns what there is for short series and nothing for unknown ones', async () => {
    const service = new MarketDataService();
    expect(await service.loadRandomWindow('USDJPY', '1d')).toHaveLength(3);
    expect(await service.loadRandomWindow('BTCUSDT', '1h')).toEqual([]);
  });

  it('fails when the data is missing and retries the index next time', async () => {
    const service = new MarketDataService();
    fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(service.loadRandomWindow('USDJPY', '1h')).rejects.toThrow('HTTP 404');
    expect(await service.loadRandomWindow('USDJPY', '1d')).toHaveLength(3);
  });
});
