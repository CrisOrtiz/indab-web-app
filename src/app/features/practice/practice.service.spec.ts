import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { PracticeTrade } from '../../core/models/practice';
import { PracticeService } from './practice.service';

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
  getDocs: vi.fn(async () => ({
    docs: [{ id: 's1', data: () => ({ symbol: 'PAXGUSDT', id: 'ignored' }) }],
  })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

import { getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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
      },
    );
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

  it("reads the student's own sessions, every session and a session's trades", async () => {
    expect(await service.mySessions('u1')).toEqual([{ symbol: 'PAXGUSDT', id: 's1' }]);
    expect(where).toHaveBeenCalledWith('uid', '==', 'u1');
    expect(await service.allSessions()).toHaveLength(1);
    // Trades logged before order types existed read as market orders.
    expect(await service.sessionTrades('s1')).toEqual([
      { orderType: 'market', orderPrice: null, symbol: 'PAXGUSDT', id: 's1' },
    ]);
    expect(vi.mocked(query).mock.calls[2][0]).toEqual({ path: 'practiceSessions/s1/trades' });
    expect(getDocs).toHaveBeenCalledTimes(3);
  });
});
