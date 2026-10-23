import { Candle, PracticeTrade } from '../../core/models/practice';
import {
  OpenTradeInput,
  Replay,
  fillsBelow,
  orderFill,
  stopHit,
  tradePnl,
  validateOrder,
} from './replay';

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
  orderType: 'market',
  orderPrice: null,
  placedTime: 2,
  quantity: 2,
  entryPrice: 100,
  entryTime: 2,
  stopLoss: null,
  takeProfit: null,
  status: 'open',
  ...patch,
});

const order = (patch: Partial<OpenTradeInput> = {}): OpenTradeInput => ({
  side: 'long',
  orderType: 'market',
  price: null,
  amount: 100,
  stopLoss: null,
  takeProfit: null,
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

describe('pending orders', () => {
  it('buy limits and sell stops wait below the price, the others above', () => {
    expect(fillsBelow('long', 'limit')).toBe(true);
    expect(fillsBelow('short', 'stop')).toBe(true);
    expect(fillsBelow('long', 'stop')).toBe(false);
    expect(fillsBelow('short', 'limit')).toBe(false);
  });

  it('fill at their price, or at the open after a gap', () => {
    const buyLimit = trade({ orderType: 'limit', orderPrice: 95, status: 'pending' });
    expect(orderFill(buyLimit, candle(3, 100, 101, 96, 97))).toBeNull();
    expect(orderFill(buyLimit, candle(3, 100, 101, 94, 97))).toBe(95);
    expect(orderFill(buyLimit, candle(3, 93, 96, 92, 95))).toBe(93);

    const buyStop = trade({ orderType: 'stop', orderPrice: 105, status: 'pending' });
    expect(orderFill(buyStop, candle(3, 100, 104, 99, 103))).toBeNull();
    expect(orderFill(buyStop, candle(3, 100, 106, 99, 103))).toBe(105);
    expect(orderFill(buyStop, candle(3, 107, 108, 106, 107))).toBe(107);
  });
});

describe('validateOrder', () => {
  it('accepts valid orders', () => {
    expect(validateOrder(order({ stopLoss: 90, takeProfit: 120 }), 100, 1000)).toBeNull();
    expect(
      validateOrder(order({ side: 'short', stopLoss: 110, takeProfit: 80 }), 100, 1000),
    ).toBeNull();
    expect(
      validateOrder(
        order({ orderType: 'limit', price: 95, stopLoss: 93, takeProfit: 99 }),
        100,
        1000,
      ),
    ).toBeNull();
    expect(
      validateOrder(order({ side: 'short', orderType: 'stop', price: 95 }), 100, 1000),
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

  it('checks limit and stop prices against the market and stops against the order price', () => {
    expect(validateOrder(order({ orderType: 'limit', price: null }), 100, 1000)).toContain(
      'precio de la orden',
    );
    expect(validateOrder(order({ orderType: 'limit', price: 101 }), 100, 1000)).toBe(
      'Una compra límite debe tener su precio por debajo del precio actual.',
    );
    expect(validateOrder(order({ orderType: 'stop', price: 99 }), 100, 1000)).toBe(
      'Una compra stop debe tener su precio por encima del precio actual.',
    );
    expect(validateOrder(order({ orderType: 'limit', price: 95, stopLoss: 97 }), 100, 1000)).toBe(
      'En una compra, el stop loss debe estar por debajo del precio de la orden.',
    );
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

  it('opens market trades at the current close and tracks balance, equity and margin', () => {
    const replay = new Replay(series(candle(3, 100, 111, 99, 110)), 2, 1000);
    const t = replay.open('a', order({ amount: 500 }));
    expect(t).toMatchObject({ entryPrice: 100, entryTime: 2, quantity: 5, status: 'open' });
    expect(replay.available()).toBe(500);
    expect(() => replay.open('b', order({ side: 'short', amount: 600 }))).toThrow(
      'saldo disponible',
    );

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
    replay.open('sl', order({ stopLoss: 95 }));
    replay.open('tp', order({ side: 'short', takeProfit: 97 }));
    replay.open('keep', order({ stopLoss: 90 }));

    const { closed } = replay.step()!;
    expect(closed.map((t) => [t.id, t.exitReason, t.exitPrice])).toEqual([
      ['sl', 'stopLoss', 95],
      ['tp', 'takeProfit', 97],
    ]);
    expect(replay.openTrades().map((t) => t.id)).toEqual(['keep']);
    expect(replay.realized()).toBe(-2);
    expect(replay.winRate()).toBe(0.5);
  });

  it('keeps limit and stop orders pending, reserving cash, until a candle reaches them', () => {
    const replay = new Replay(
      series(candle(3, 100, 101, 98, 99), candle(4, 99, 99, 94, 95), candle(5, 95, 96, 89, 90)),
      2,
      1000,
    );
    const limit = replay.open(
      'l',
      order({ orderType: 'limit', price: 96, amount: 480, stopLoss: 91 }),
    );
    expect(limit).toMatchObject({ status: 'pending', orderPrice: 96, entryPrice: 96, quantity: 5 });
    expect(replay.available()).toBe(520);
    expect(replay.filledCount()).toBe(0);

    expect(replay.step()!.filled).toEqual([]);
    const { filled } = replay.step()!;
    expect(filled).toEqual([
      expect.objectContaining({ id: 'l', status: 'open', entryPrice: 96, entryTime: 4 }),
    ]);
    expect(replay.filledCount()).toBe(1);

    // Checked for its stop loss from the next candle on.
    const { closed } = replay.step()!;
    expect(closed).toEqual([expect.objectContaining({ exitPrice: 91, pnl: -25 })]);
  });

  it('moves the levels of pending orders and open trades, validating them', () => {
    const replay = new Replay(series(candle(3, 100, 100, 100, 100)), 2);
    replay.open('l', order({ orderType: 'limit', price: 95 }));
    expect(replay.modify('l', { stopLoss: 90, takeProfit: 105, orderPrice: 97 })).toMatchObject({
      orderPrice: 97,
      entryPrice: 97,
      stopLoss: 90,
      takeProfit: 105,
    });
    expect(() => replay.modify('l', { stopLoss: 98, takeProfit: null })).toThrow('stop loss');
    expect(() => replay.modify('l', { stopLoss: null, takeProfit: null, orderPrice: 101 })).toThrow(
      'por debajo del precio actual',
    );

    replay.open('m', order());
    expect(replay.modify('m', { stopLoss: 99, takeProfit: null })).toMatchObject({ stopLoss: 99 });
    expect(() => replay.modify('m', { stopLoss: 101, takeProfit: null })).toThrow('stop loss');
    replay.close('m');
    expect(() => replay.modify('m', { stopLoss: 99, takeProfit: null })).toThrow('cerrada');
  });

  it('cancels pending orders, by hand or when the replay ends', () => {
    const replay = new Replay(series(candle(3, 100, 100, 100, 100)), 2);
    replay.open('a', order({ orderType: 'stop', price: 105 }));
    replay.open('b', order({ orderType: 'limit', price: 95 }));
    replay.open('c', order());
    expect(replay.cancel('a').status).toBe('cancelled');
    expect(() => replay.cancel('a')).toThrow();

    const { cancelled, closed } = replay.closeAll('sessionEnd');
    expect(cancelled.map((t) => t.id)).toEqual(['b']);
    expect(closed.map((t) => [t.id, t.exitReason])).toEqual([['c', 'sessionEnd']]);
    expect(replay.pendingOrders()).toEqual([]);
    expect(replay.openTrades()).toEqual([]);
  });

  it('can forget an order that was never logged and restore an edit that failed', () => {
    const replay = new Replay(series(candle(3, 100, 100, 100, 100)), 2);
    const before = replay.open('a', order({ stopLoss: 90 }));
    replay.modify('a', { stopLoss: 95, takeProfit: null });
    replay.restore(before);
    expect(replay.trades()[0].stopLoss).toBe(90);
    replay.discard('a');
    expect(replay.trades()).toEqual([]);
  });
});
