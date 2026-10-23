import { Candle, PracticeTrade } from '../../core/models/practice';
import { Replay, stopHit, tradePnl, validateOrder } from './replay';

const candle = (time: number, open: number, high: number, low: number, close: number): Candle => ({
  time,
  open,
  high,
  low,
  close,
});

/** Flat candles at 100, then the given ones. */
const series = (...next: Candle[]) => [
  candle(1, 100, 100, 100, 100),
  candle(2, 100, 100, 100, 100),
  ...next,
];

const trade = (patch: Partial<PracticeTrade>): PracticeTrade => ({
  id: 't',
  uid: 'u',
  side: 'long',
  quantity: 2,
  entryPrice: 100,
  entryTime: 2,
  stopLoss: null,
  takeProfit: null,
  status: 'open',
  ...patch,
});

describe('tradePnl', () => {
  it('earns when the price moves in the trade direction', () => {
    expect(tradePnl(trade({ side: 'long' }), 110)).toBe(20);
    expect(tradePnl(trade({ side: 'short' }), 110)).toBe(-20);
    expect(tradePnl(trade({ side: 'short' }), 95.5)).toBe(9);
  });
});

describe('stopHit', () => {
  it('fills long stops and targets at their level', () => {
    const t = trade({ stopLoss: 95, takeProfit: 110 });
    expect(stopHit(t, candle(3, 100, 105, 94, 96))).toEqual({ price: 95, reason: 'stopLoss' });
    expect(stopHit(t, candle(3, 100, 111, 99, 108))).toEqual({ price: 110, reason: 'takeProfit' });
    expect(stopHit(t, candle(3, 100, 105, 96, 104))).toBeNull();
  });

  it('fills short stops and targets at their level', () => {
    const t = trade({ side: 'short', stopLoss: 105, takeProfit: 90 });
    expect(stopHit(t, candle(3, 100, 106, 99, 104))).toEqual({ price: 105, reason: 'stopLoss' });
    expect(stopHit(t, candle(3, 100, 101, 89, 92))).toEqual({ price: 90, reason: 'takeProfit' });
  });

  it('fills at the open when the price gaps through the level', () => {
    expect(stopHit(trade({ stopLoss: 95 }), candle(3, 90, 92, 88, 91))).toEqual({
      price: 90,
      reason: 'stopLoss',
    });
    expect(stopHit(trade({ side: 'short', takeProfit: 90 }), candle(3, 85, 86, 84, 85))).toEqual({
      price: 85,
      reason: 'takeProfit',
    });
  });

  it('assumes the stop loss came first when one candle touches both', () => {
    const t = trade({ stopLoss: 95, takeProfit: 110 });
    expect(stopHit(t, candle(3, 100, 112, 90, 100))?.reason).toBe('stopLoss');
  });
});

describe('validateOrder', () => {
  const order = (patch = {}) => ({
    side: 'long' as const,
    amount: 100,
    stopLoss: null,
    takeProfit: null,
    ...patch,
  });

  it('accepts a valid order', () => {
    expect(validateOrder(order({ stopLoss: 90, takeProfit: 120 }), 100, 1000)).toBeNull();
    expect(
      validateOrder(order({ side: 'short', stopLoss: 110, takeProfit: 80 }), 100, 1000),
    ).toBeNull();
  });

  it('rejects bad amounts and levels on the wrong side of the price', () => {
    expect(validateOrder(order({ amount: 0 }), 100, 1000)).toContain('mayor a 0');
    expect(validateOrder(order({ amount: 2000 }), 100, 1000)).toContain('saldo disponible');
    expect(validateOrder(order({ stopLoss: 101 }), 100, 1000)).toContain('por debajo');
    expect(validateOrder(order({ takeProfit: 99 }), 100, 1000)).toContain('por encima');
    expect(validateOrder(order({ side: 'short', stopLoss: 99 }), 100, 1000)).toContain(
      'por encima',
    );
    expect(validateOrder(order({ side: 'short', takeProfit: 101 }), 100, 1000)).toContain(
      'por debajo',
    );
    expect(validateOrder(order({ stopLoss: -5 }), 100, 1000)).toContain('mayores a 0');
  });
});

describe('Replay', () => {
  it('starts after the history bars and steps one candle at a time', () => {
    const replay = new Replay(
      series(candle(3, 100, 101, 99, 101), candle(4, 101, 102, 100, 102)),
      2,
    );
    expect(replay.cursor()).toBe(1);
    expect(replay.progress()).toBe(0);
    expect(replay.step()?.candle.time).toBe(3);
    expect(replay.finished()).toBe(false);
    replay.step();
    expect(replay.finished()).toBe(true);
    expect(replay.progress()).toBe(1);
    expect(replay.step()).toBeNull();
  });

  it('needs candles to replay after the history', () => {
    expect(() => new Replay(series(), 3)).toThrow();
  });

  it('opens trades at the current close and tracks balance, equity and margin', () => {
    const replay = new Replay(series(candle(3, 100, 111, 99, 110)), 2, 1000);
    const t = replay.open('a', { side: 'long', amount: 500, stopLoss: null, takeProfit: null });
    expect(t).toMatchObject({ entryPrice: 100, entryTime: 2, quantity: 5, status: 'open' });
    expect(replay.available()).toBe(500);
    expect(() =>
      replay.open('b', { side: 'short', amount: 600, stopLoss: null, takeProfit: null }),
    ).toThrow('saldo disponible');

    replay.step();
    expect(replay.unrealized()).toBe(50);
    expect(replay.equity()).toBe(1050);

    const closed = replay.close('a');
    expect(closed).toMatchObject({ status: 'closed', exitPrice: 110, exitTime: 3, pnl: 50 });
    expect(replay.balance()).toBe(1050);
    expect(replay.available()).toBe(1050);
    expect(replay.winRate()).toBe(1);
    expect(() => replay.close('a')).toThrow();
  });

  it('closes trades whose stop loss or take profit the new candle hits', () => {
    const replay = new Replay(series(candle(3, 100, 103, 94, 96), candle(4, 96, 97, 95, 96)), 2);
    replay.open('sl', { side: 'long', amount: 100, stopLoss: 95, takeProfit: null });
    replay.open('tp', { side: 'short', amount: 100, stopLoss: null, takeProfit: 97 });
    replay.open('keep', { side: 'long', amount: 100, stopLoss: 90, takeProfit: null });

    const { closed } = replay.step()!;
    expect(closed.map((t) => [t.id, t.exitReason, t.exitPrice])).toEqual([
      ['sl', 'stopLoss', 95],
      ['tp', 'takeProfit', 97],
    ]);
    expect(replay.openTrades().map((t) => t.id)).toEqual(['keep']);
    expect(replay.realized()).toBe(-2);
    expect(replay.winRate()).toBe(0.5);

    expect(replay.closeAll('sessionEnd').map((t) => t.exitReason)).toEqual(['sessionEnd']);
    expect(replay.openTrades()).toEqual([]);
  });

  it('can forget an open trade that was never logged', () => {
    const replay = new Replay(series(candle(3, 100, 100, 100, 100)), 2);
    replay.open('a', { side: 'long', amount: 100, stopLoss: null, takeProfit: null });
    replay.discard('a');
    expect(replay.trades()).toEqual([]);
  });
});
