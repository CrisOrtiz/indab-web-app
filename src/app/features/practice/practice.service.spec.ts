import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { PracticeTrade } from '../../core/models/practice';
import { PracticeService } from './practice.service';

const batch = vi.hoisted(() => ({ delete: vi.fn(), commit: vi.fn(async () => undefined) }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  doc: vi.fn((parent: { path: string }, id?: string) => {
    const docId = id ?? 'generated-id';
    return { path: `${parent.path}/${docId}`, id: docId };
  }),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  where: vi.fn((...args) => ['where', ...args]),
  orderBy: vi.fn((...args) => ['orderBy', ...args]),
  limit: vi.fn((n) => ['limit', n]),
  startAfter: vi.fn((cursor) => ['startAfter', cursor]),
  count: vi.fn(() => 'count'),
  sum: vi.fn((field) => ['sum', field]),
  getAggregateFromServer: vi.fn(async () => ({ data: () => ({ sessions: 12, trades: 40 }) })),
  getDocs: vi.fn(async () => ({
    docs: [{ id: 's1', data: () => ({ symbol: 'PAXGUSDT', id: 'ignored' }) }],
  })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  writeBatch: vi.fn(() => batch),
}));

import {
  getAggregateFromServer,
  getDocs,
  query,
  setDoc,
  sum,
  updateDoc,
  where,
} from 'firebase/firestore';

describe('PracticeService', () => {
  let service: PracticeService;

  const trade: PracticeTrade = {
    id: 't1',
    uid: '',
    side: 'short',
    orderType: 'market',
    orderPrice: null,
    placedTime: 10,
    quantity: 0.5,
    entryPrice: 100,
    entryTime: 10,
    stopLoss: 110,
    takeProfit: null,
    status: 'closed',
    exitPrice: 90,
    exitTime: 20,
    exitReason: 'takeProfit',
    pnl: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: FIRESTORE, useValue: {} }] });
    service = TestBed.inject(PracticeService);
  });

  it('saves where the replay is, without undefined fields', async () => {
    await service.saveResume('s1', {
      time: 600,
      interval: '5m',
      hideDates: true,
      speed: 2,
      drawings: [{ id: 1, kind: 'rect', points: [], color: '#fff', offset: undefined }],
    });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'practiceSessions/s1', id: 's1' },
      {
        resume: {
          time: 600,
          interval: '5m',
          hideDates: true,
          speed: 2,
          drawings: [{ id: 1, kind: 'rect', points: [], color: '#fff' }],
        },
      },
    );
  });

  it("lists the student's active sessions, newest first", async () => {
    const sessions = await service.activeSessions('u1');
    expect(where).toHaveBeenCalledWith('uid', '==', 'u1');
    expect(where).toHaveBeenCalledWith('status', '==', 'active');
    expect(sessions).toEqual([{ symbol: 'PAXGUSDT', id: 's1' }]);
  });

  it('starts an active session with an empty summary', async () => {
    const id = await service.startSession({
      uid: 'u1',
      userName: 'Ana',
      symbol: 'PAXGUSDT',
      interval: '1h',
      replayStart: 1000,
      startingBalance: 10000,
    });
    expect(id).toBe('generated-id');
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'practiceSessions/generated-id', id: 'generated-id' },
      {
        uid: 'u1',
        userName: 'Ana',
        symbol: 'PAXGUSDT',
        interval: '1h',
        replayStart: 1000,
        startingBalance: 10000,
        balance: 10000,
        pnl: 0,
        tradeCount: 0,
        status: 'active',
        startedAt: 'SERVER_TIMESTAMP',
        evaluationId: null,
      },
    );
  });

  it("starts an evaluation attempt as the student's one session for it", async () => {
    const id = await service.startSession(
      {
        uid: 'u1',
        userName: 'Ana',
        symbol: 'PAXGUSDT',
        interval: '15m',
        replayStart: 1000,
        startingBalance: 200,
      },
      { id: 'e1', durationMinutes: 30 },
    );
    expect(id).toBe('e1_u1');
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'practiceSessions/e1_u1', id: 'e1_u1' },
      expect.objectContaining({ evaluationId: 'e1', durationMinutes: 30, status: 'active' }),
    );
  });

  it('reads evaluation attempts', async () => {
    expect(await service.evaluationSessions('e1')).toEqual([{ id: 's1', symbol: 'PAXGUSDT' }]);
    expect(where).toHaveBeenCalledWith('evaluationId', '==', 'e1');

    vi.mocked(getDocs).mockClear();
    const ids = Array.from({ length: 31 }, (_, i) => `e${i}`);
    await service.myAttempts('u1', ids);
    // An `in` filter takes at most 30 values.
    expect(getDocs).toHaveBeenCalledTimes(2);
    expect(where).toHaveBeenCalledWith('evaluationId', 'in', ids.slice(30));
  });

  it('logs a trade as open with only its entry fields, then closes it', async () => {
    expect(service.newTradeId('s1')).toBe('generated-id');

    await service.openTrade('s1', 'u1', { ...trade, status: 'open' });
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'practiceSessions/s1/trades/t1' }),
      {
        uid: 'u1',
        side: 'short',
        orderType: 'market',
        orderPrice: null,
        placedTime: 10,
        quantity: 0.5,
        entryPrice: 100,
        entryTime: 10,
        stopLoss: 110,
        takeProfit: null,
        status: 'open',
        openedAt: 'SERVER_TIMESTAMP',
      },
    );

    await service.closeTrade('s1', trade);
    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'practiceSessions/s1/trades/t1' }),
      {
        status: 'closed',
        exitPrice: 90,
        exitTime: 20,
        exitReason: 'takeProfit',
        pnl: 5,
        closedAt: 'SERVER_TIMESTAMP',
      },
    );
  });

  it('fills, cancels and moves pending orders and moves stops of open trades', async () => {
    const ref = expect.objectContaining({ path: 'practiceSessions/s1/trades/t1' });
    const pending = { ...trade, orderType: 'limit', orderPrice: 99, status: 'pending' } as const;

    await service.updateLevels('s1', { ...pending, orderPrice: 98, entryPrice: 98, stopLoss: 105 });
    expect(updateDoc).toHaveBeenLastCalledWith(ref, {
      stopLoss: 105,
      takeProfit: null,
      orderPrice: 98,
      entryPrice: 98,
    });
    await service.updateLevels('s1', { ...trade, status: 'open', stopLoss: 104, takeProfit: 90 });
    expect(updateDoc).toHaveBeenLastCalledWith(ref, { stopLoss: 104, takeProfit: 90 });

    await service.fillOrder('s1', { ...pending, status: 'open', entryPrice: 98.5, entryTime: 11 });
    expect(updateDoc).toHaveBeenLastCalledWith(ref, {
      status: 'open',
      entryPrice: 98.5,
      entryTime: 11,
      filledAt: 'SERVER_TIMESTAMP',
    });
    await service.cancelOrder('s1', pending);
    expect(updateDoc).toHaveBeenLastCalledWith(ref, {
      status: 'cancelled',
      closedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('updates the summary and finishes the session', async () => {
    const summary = { balance: 10005, pnl: 5, tradeCount: 1 };
    await service.updateSummary('s1', summary);
    expect(updateDoc).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: 'practiceSessions/s1' }),
      summary,
    );
    await service.finishSession('s1', summary);
    expect(updateDoc).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: 'practiceSessions/s1' }),
      {
        ...summary,
        status: 'finished',
        endedAt: 'SERVER_TIMESTAMP',
      },
    );
  });

  it("reads the student's own sessions and a session's trades", async () => {
    expect(await service.mySessions('u1')).toEqual([{ symbol: 'PAXGUSDT', id: 's1' }]);
    expect(where).toHaveBeenCalledWith('uid', '==', 'u1');
    expect(await service.sessionsPage({}, 20)).toEqual(
      expect.objectContaining({ items: [{ symbol: 'PAXGUSDT', id: 's1' }], hasMore: false }),
    );
    // Trades logged before order types existed read as market orders.
    expect(await service.sessionTrades('s1')).toEqual([
      { orderType: 'market', orderPrice: null, symbol: 'PAXGUSDT', id: 's1' },
    ]);
    expect(vi.mocked(query).mock.calls[2][0]).toEqual({ path: 'practiceSessions/s1/trades' });
    expect(getDocs).toHaveBeenCalledTimes(3);
  });

  it('pages sessions with filters and a cursor, reading one extra to know if more follow', async () => {
    const docs = ['a', 'b', 'c'].map((id) => ({ id, data: () => ({ symbol: 'XAUUSDT' }) }));
    vi.mocked(getDocs).mockResolvedValueOnce({ docs } as never);
    const from = new Date(2026, 9, 1);
    const to = new Date(2026, 9, 2);
    const cursor = { id: 'z' } as never;
    const page = await service.sessionsPage(
      { uid: 'u1', evaluationId: null, status: 'finished', from, to },
      2,
      cursor,
    );
    expect(page.items.map((s) => s.id)).toEqual(['a', 'b']);
    expect(page.last).toBe(docs[1]);
    expect(page.hasMore).toBe(true);
    expect(vi.mocked(query).mock.calls[0].slice(1)).toEqual([
      ['where', 'uid', '==', 'u1'],
      ['where', 'evaluationId', '==', null],
      ['where', 'status', '==', 'finished'],
      ['where', 'startedAt', '>=', from],
      ['where', 'startedAt', '<', to],
      ['orderBy', 'startedAt', 'desc'],
      ['startAfter', cursor],
      ['limit', 3],
    ]);
  });

  it('leaves out the filters that are not set', async () => {
    await service.sessionsPage({ evaluationId: 'e1' }, 10);
    expect(vi.mocked(query).mock.calls[0].slice(1)).toEqual([
      ['where', 'evaluationId', '==', 'e1'],
      ['orderBy', 'startedAt', 'desc'],
      ['limit', 11],
    ]);
  });

  it('counts the sessions and trades that match the filters in one aggregation', async () => {
    expect(await service.sessionTotals({ uid: 'u1' })).toEqual({ sessions: 12, trades: 40 });
    expect(vi.mocked(query).mock.calls[0].slice(1)).toEqual([['where', 'uid', '==', 'u1']]);
    expect(getAggregateFromServer).toHaveBeenCalledWith(expect.anything(), {
      sessions: 'count',
      trades: ['sum', 'tradeCount'],
    });
    expect(sum).toHaveBeenCalledWith('tradeCount');
  });

  it('deletes a session with its trades', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [{ ref: { path: 'practiceSessions/s1/trades/t1' } }],
    } as never);
    await service.deleteSession('s1');
    expect(batch.delete.mock.calls.map(([ref]) => ref.path)).toEqual([
      'practiceSessions/s1/trades/t1',
      'practiceSessions/s1',
    ]);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});
