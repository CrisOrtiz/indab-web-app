import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { NewsInput } from '../../core/models/market-news';
import { Candle } from '../../core/models/practice';
import { NewsService, monthBounds, monthsBetween } from './news.service';

vi.mock('firebase/firestore', () => {
  let next = 0;
  return {
    collection: vi.fn((_db, path: string) => ({ path })),
    doc: vi.fn((parent: { path?: string }, ...path: string[]) => ({
      path: path.length ? path.join('/') : `${parent.path}/new${++next}`,
      id: path.length ? path[path.length - 1] : `new${next}`,
    })),
    where: vi.fn((field: string, op: string, value: number) => ({ field, op, value })),
    orderBy: vi.fn((field: string) => ({ orderBy: field })),
    query: vi.fn(
      (ref: unknown, ...constraints: { field?: string; op?: string; value?: number }[]) => ({
        ref,
        constraints,
      }),
    ),
    getDocs: vi.fn(),
    setDoc: vi.fn(async () => undefined),
    deleteDoc: vi.fn(async () => undefined),
    serverTimestamp: vi.fn(() => 'NOW'),
    writeBatch: vi.fn(),
  };
});

import { deleteDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';

const at = (iso: string) => Date.parse(iso) / 1000;
const bar = (iso: string): Candle => ({ time: at(iso), open: 1, high: 1, low: 1, close: 1 });
const input = (time: number, extra: Partial<NewsInput> = {}): NewsInput => ({
  time,
  name: ' NFP ',
  country: 'US',
  impact: 'high',
  actual: ' ',
  forecast: '180K',
  previous: null,
  ...extra,
});

describe('NewsService', () => {
  let service: NewsService;
  /** Stored releases by id, read by the faked range query. */
  let stored: Record<string, { time: number; name: string }>;

  beforeEach(() => {
    vi.clearAllMocks();
    stored = {};
    vi.mocked(getDocs).mockImplementation((async (q: {
      constraints: { op?: string; value?: number }[];
    }) => {
      const from = q.constraints.find((c) => c.op === '>=')!.value!;
      const to = q.constraints.find((c) => c.op === '<')!.value!;
      return {
        docs: Object.entries(stored)
          .filter(([, d]) => d.time >= from && d.time < to)
          .map(([id, d]) => ({ id, data: () => d })),
      };
    }) as never);
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: { user: signal({ uid: 'trainer' }) } },
      ],
    });
    service = TestBed.inject(NewsService);
  });

  it('names months in UTC, across years', () => {
    expect(monthsBetween(at('2025-11-20T00:00:00Z'), at('2026-02-01T00:00:00Z'))).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(monthBounds('2026-12')).toEqual({
      start: at('2026-12-01T00:00:00Z'),
      end: at('2027-01-01T00:00:00Z'),
    });
  });

  it('reads each month once, by its time range', async () => {
    stored['a'] = { time: at('2026-01-09T13:30:00Z'), name: 'NFP' };
    stored['b'] = { time: at('2026-02-11T13:30:00Z'), name: 'NFP' };
    const january = await service.month('2026-01');
    expect(january.map((e) => e.id)).toEqual(['a']);
    expect(january[0]).toMatchObject({ country: 'US', actual: null, forecast: null });
    await service.month('2026-01');
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('reads a failed month again next time', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('offline'));
    expect(await service.month('2026-01')).toEqual([]);
    stored['a'] = { time: at('2026-01-09T13:30:00Z'), name: 'NFP' };
    expect((await service.month('2026-01')).map((e) => e.id)).toEqual(['a']);
  });

  it('feeds the news of the months the bars cover, two days ahead, while switched on', async () => {
    stored['a'] = { time: at('2026-01-20T13:30:00Z'), name: 'CPI' };
    stored['b'] = { time: at('2026-02-01T13:30:00Z'), name: 'NFP' };
    const candles = signal([bar('2026-01-10T00:00:00Z'), bar('2026-01-30T12:00:00Z')]);
    const on = signal(true);
    const feed = runInInjectionContext(TestBed.inject(Injector), () => service.feed(candles, on));
    TestBed.tick();
    await vi.waitFor(() => expect(feed().map((e) => e.id)).toEqual(['a', 'b']));
    expect(getDocs).toHaveBeenCalledTimes(2);

    // More bars in the same months read nothing more.
    candles.update((bars) => [...bars, bar('2026-01-30T13:00:00Z')]);
    TestBed.tick();
    expect(getDocs).toHaveBeenCalledTimes(2);

    on.set(false);
    TestBed.tick();
    expect(feed()).toEqual([]);
  });

  it('saves releases trimmed and signed, and deletes them', async () => {
    const id = await service.save(input(100));
    expect(setDoc).toHaveBeenCalledWith(
      { path: `marketNews/${id}`, id },
      {
        time: 100,
        name: 'NFP',
        country: 'US',
        impact: 'high',
        actual: null,
        forecast: '180K',
        previous: null,
        updatedBy: 'trainer',
        updatedAt: 'NOW',
      },
    );
    await service.save(input(200), 'n1');
    expect(vi.mocked(setDoc).mock.calls[1][0]).toEqual({ path: 'marketNews/n1', id: 'n1' });
    await service.remove('n1');
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'marketNews/n1', id: 'n1' });
  });

  it('adds only the official releases not in the calendar yet', async () => {
    const commit = vi.fn(async () => undefined);
    const set = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({ set, commit } as never);
    stored['official-nfp-2026-01-09'] = { time: at('2026-01-09T13:30:00Z'), name: 'Edited' };
    const added = await service.importMissing([
      { ...input(at('2026-01-09T13:30:00Z')), id: 'official-nfp-2026-01-09' },
      { ...input(at('2026-02-11T13:30:00Z')), id: 'official-nfp-2026-02-11' },
    ]);
    expect(added).toBe(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toEqual({
      path: 'marketNews/official-nfp-2026-02-11',
      id: 'official-nfp-2026-02-11',
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(await service.importMissing([])).toBe(0);
  });
});
