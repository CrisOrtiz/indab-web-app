import { PracticeTrade } from '../../core/models/practice';
import { filledTrades, tradeBox } from './trade-boxes';

const trade = (over: Partial<PracticeTrade>): PracticeTrade => ({
  id: 't',
  uid: 'u',
  side: 'long',
  orderType: 'market',
  orderPrice: null,
  placedTime: 100,
  quantity: 1,
  entryPrice: 2000,
  entryTime: 100,
  stopLoss: null,
  takeProfit: null,
  status: 'closed',
  exitPrice: 2010,
  exitTime: 400,
  exitReason: 'manual',
  pnl: 10,
  ...over,
});

describe('trade boxes', () => {
  it('walks through filled trades in the order they were opened', () => {
    const list = filledTrades([
      trade({ id: 'late', entryTime: 500 }),
      trade({ id: 'pending', status: 'pending' }),
      trade({ id: 'cancelled', status: 'cancelled' }),
      trade({ id: 'open', status: 'open', entryTime: 300 }),
      trade({ id: 'first', entryTime: 100 }),
    ]);
    expect(list.map((t) => t.id)).toEqual(['first', 'open', 'late']);
  });

  it('spans entry to TP in green and entry to SL in red', () => {
    expect(tradeBox(trade({ stopLoss: 1990, takeProfit: 2030 }), 900)).toEqual({
      id: 't',
      side: 'long',
      start: 100,
      end: 400,
      entry: 2000,
      profit: 2030,
      loss: 1990,
      exit: 2010,
      pnl: 10,
    });
  });

  it('uses the exit for the zone a trade without TP or SL reached', () => {
    // A long closed higher: green up to the exit, no red.
    expect(tradeBox(trade({}), 900)).toMatchObject({ profit: 2010, loss: null });
    // A short closed higher lost: red up to the exit.
    expect(tradeBox(trade({ side: 'short', pnl: -10 }), 900)).toMatchObject({
      profit: null,
      loss: 2010,
    });
    // A short with a stop loss closed lower: SL in red, green to the exit.
    expect(
      tradeBox(trade({ side: 'short', stopLoss: 2020, exitPrice: 1985, pnl: 15 }), 900),
    ).toMatchObject({ profit: 1985, loss: 2020 });
    // Closed at its entry: just the entry line.
    expect(tradeBox(trade({ exitPrice: 2000, pnl: 0 }), 900)).toMatchObject({
      profit: null,
      loss: null,
    });
  });

  it('runs an open trade to the last bar', () => {
    const open = trade({
      status: 'open',
      exitPrice: undefined,
      exitTime: undefined,
      pnl: undefined,
    });
    expect(tradeBox({ ...open, stopLoss: 1995 }, 900)).toMatchObject({
      end: 900,
      exit: null,
      pnl: null,
      profit: null,
      loss: 1995,
    });
  });
});
