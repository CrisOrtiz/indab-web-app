import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { NewsEvent } from '../../core/models/market-news';
import { Candle } from '../../core/models/practice';
import { NewsService } from './news.service';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  getDoc: vi.fn(),
}));

import { getDoc } from 'firebase/firestore';

const event = (id: string, time: number) => ({ id, time }) as NewsEvent;
const bar = (iso: string): Candle => {
  const time = Date.parse(iso) / 1000;
  return { time, open: 1, high: 1, low: 1, close: 1 };
};

describe('NewsService', () => {
  let service: NewsService;
  const months: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(months)) {
      delete months[key];
    }
    vi.mocked(getDoc).mockImplementation((async (ref: { path: string }) => ({
      data: () => months[ref.path],
    })) as never);
    TestBed.configureTestingModule({ providers: [{ provide: FIRESTORE, useValue: {} }] });
    service = TestBed.inject(NewsService);
  });

  it('reads each month once, with none for a month never copied', async () => {
    months['marketNews/2026-01'] = { events: [event('a', 1)] };
    expect(await service.month('2026-01')).toEqual([event('a', 1)]);
    expect(await service.month('2026-01')).toEqual([event('a', 1)]);
    expect(await service.month('2026-02')).toEqual([]);
    expect(getDoc).toHaveBeenCalledTimes(2);
  });

  it('reads a failed month again next time', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('offline'));
    expect(await service.month('2026-01')).toEqual([]);
    months['marketNews/2026-01'] = { events: [event('a', 1)] };
    expect(await service.month('2026-01')).toEqual([event('a', 1)]);
  });

  it('feeds the news of the months the bars cover, two days ahead, while switched on', async () => {
    months['marketNews/2026-01'] = { events: [event('a', 1)] };
    months['marketNews/2026-02'] = { events: [event('b', 2)] };
    const candles = signal([bar('2026-01-10T00:00:00Z'), bar('2026-01-30T12:00:00Z')]);
    const on = signal(true);
    const feed = runInInjectionContext(TestBed.inject(Injector), () => service.feed(candles, on));
    TestBed.tick();
    await vi.waitFor(() => expect(feed()).toEqual([event('a', 1), event('b', 2)]));
    expect(vi.mocked(getDoc).mock.calls.map(([ref]) => (ref as { path: string }).path)).toEqual([
      'marketNews/2026-01',
      'marketNews/2026-02',
    ]);

    // More bars in the same months read nothing more.
    candles.update((bars) => [...bars, bar('2026-01-30T13:00:00Z')]);
    TestBed.tick();
    expect(getDoc).toHaveBeenCalledTimes(2);

    on.set(false);
    TestBed.tick();
    expect(feed()).toEqual([]);
  });
});
