import { PracticeTrade } from '../../core/models/practice';
import { disciplineMarks, disciplinePoints, riskUsd, stopDistance } from './discipline';

let ids = 0;
/** A closed long from 100 with its stop at 98 and target at 104, filled at `entryTime`. */
const trade = (extra: Partial<PracticeTrade> = {}) =>
  ({
    id: `t${++ids}`,
    status: 'closed',
    side: 'long',
    entryPrice: 100,
    entryTime: 0,
    placedTime: 0,
    quantity: 1,
    stopLoss: 98,
    initialStopLoss: 98,
    takeProfit: 104,
    exitTime: 60,
    exitReason: 'takeProfit',
    pnl: 4,
    ...extra,
  }) as PracticeTrade;
const hour = 3600;
const kinds = (trades: PracticeTrade[]) =>
  disciplineMarks(trades).map((m) => `${m.trade}:${m.kind}`);

describe('discipline', () => {
  it('finds nothing in clean trades', () => {
    expect(kinds([trade(), trade({ entryTime: hour, exitTime: hour + 60 })])).toEqual([]);
  });

  it('measures risk to the farther of the first and last stop', () => {
    expect(stopDistance(trade())).toBe(2);
    expect(stopDistance(trade({ stopLoss: 95 }))).toBe(5);
    // A stop moved past the entry locks a gain: the first one is what was risked.
    expect(stopDistance(trade({ stopLoss: 101 }))).toBe(2);
    expect(riskUsd(trade({ quantity: 3 }))).toBe(6);
    expect(riskUsd(trade({ stopLoss: null, initialStopLoss: null }))).toBeNull();
  });

  it('marks a removed or widened stop, and rewards a break-even stop', () => {
    expect(kinds([trade({ stopLoss: null })])).toEqual(['1:removedStop']);
    expect(kinds([trade({ stopLoss: 97 })])).toEqual(['1:widenedStop']);
    expect(kinds([trade({ side: 'short', stopLoss: 103, initialStopLoss: 102 })])).toEqual([
      '1:widenedStop',
    ]);
    expect(kinds([trade({ stopLoss: 100 })])).toEqual(['1:breakeven']);
    // Trades logged before the first stop was recorded are not judged on it.
    expect(kinds([trade({ stopLoss: null, initialStopLoss: undefined })])).toEqual([]);
  });

  it('marks revenge trades and martingales after a loss', () => {
    const loss = trade({ pnl: -2, exitReason: 'stopLoss' });
    // Ten minutes after the loss, with double the risk.
    expect(kinds([loss, trade({ entryTime: 660, exitTime: 700, quantity: 2 })])).toEqual([
      '2:revenge',
      '2:martingale',
    ]);
    // An hour later with the same risk on a tighter stop and more lots: fine.
    expect(
      kinds([
        loss,
        trade({
          entryTime: hour,
          exitTime: hour + 60,
          quantity: 2,
          stopLoss: 99,
          initialStopLoss: 99,
        }),
      ]),
    ).toEqual([]);
    // After a win, nothing.
    expect(kinds([trade(), trade({ entryTime: 120, exitTime: 180, quantity: 3 })])).toEqual([]);
  });

  it('marks averaging down and hedging while another trade is open', () => {
    const first = trade({ exitTime: 600 });
    expect(
      kinds([first, trade({ entryTime: 60, entryPrice: 99, stopLoss: 97, initialStopLoss: 97 })]),
    ).toEqual(['2:averagingDown']);
    // Adding to a winner is not averaging down.
    expect(
      kinds([
        first,
        trade({
          entryTime: 60,
          entryPrice: 101,
          stopLoss: 99,
          initialStopLoss: 99,
          takeProfit: 105,
        }),
      ]),
    ).toEqual([]);
    expect(
      kinds([
        first,
        trade({
          side: 'short',
          entryTime: 60,
          stopLoss: 102,
          initialStopLoss: 102,
          takeProfit: 96,
        }),
      ]),
    ).toEqual(['2:hedging']);
  });

  it('marks trades left open at the end and trades without take profit', () => {
    expect(kinds([trade({ exitReason: 'sessionEnd', takeProfit: null })])).toEqual([
      '1:leftOpen',
      '1:noTakeProfit',
    ]);
  });

  it('numbers trades as the navigator does and skips open ones', () => {
    const open = trade({ status: 'open', exitTime: undefined, stopLoss: null, entryTime: 30 });
    const late = trade({ entryTime: hour, exitTime: hour + 60, takeProfit: null });
    expect(kinds([late, open, trade()])).toEqual(['3:noTakeProfit']);
  });

  it('scores discipline from 100, less each fault, plus break-even stops', () => {
    expect(disciplinePoints([])).toBe(100);
    expect(
      disciplinePoints([
        { kind: 'widenedStop', trade: 1 },
        { kind: 'noTakeProfit', trade: 2 },
        { kind: 'breakeven', trade: 3 },
      ]),
    ).toBe(75);
    expect(disciplinePoints([{ kind: 'breakeven', trade: 1 }])).toBe(100);
    expect(
      disciplinePoints([
        { kind: 'removedStop', trade: 1 },
        { kind: 'removedStop', trade: 2 },
        { kind: 'removedStop', trade: 3 },
      ]),
    ).toBe(0);
  });
});
