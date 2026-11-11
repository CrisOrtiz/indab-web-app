import { PracticeTrade } from '../../core/models/practice';
import { orderWarnings } from './order-warnings';

/** A long from 100 with a stop at 98 on 1 unit. */
const order = (extra: Partial<Parameters<typeof orderWarnings>[0]> = {}) => ({
  side: 'long' as const,
  entry: 100,
  stopLoss: 98 as number | null,
  units: 1,
  ...extra,
});
const closedTrade = (extra: Partial<PracticeTrade>) =>
  ({
    status: 'closed',
    side: 'short',
    entryPrice: 100,
    entryTime: 0,
    exitTime: 600,
    quantity: 1,
    pnl: -5,
    ...extra,
  }) as PracticeTrade;

describe('orderWarnings', () => {
  it('says nothing about a small order with a stop loss', () => {
    expect(orderWarnings(order(), 200, [], 1000)).toEqual([]);
  });

  it('warns when the order risks more than 15 % of the balance', () => {
    // 10 USD a unit on 3.2 units = 32 USD of 200 = 16 %.
    const warnings = orderWarnings(order({ stopLoss: 90, units: 3.2 }), 200, [], 1000);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('risk');
    expect((warnings[0] as { pct: number }).pct).toBeCloseTo(0.16);
    // Exactly 15 % is allowed.
    expect(orderWarnings(order({ stopLoss: 90, units: 3 }), 200, [], 1000)).toEqual([]);
    // A short's stop sits above.
    expect(
      orderWarnings(order({ side: 'short', stopLoss: 110, units: 4 }), 200, [], 1000)[0].kind,
    ).toBe('risk');
    // A stop on the winning side risks nothing.
    expect(orderWarnings(order({ stopLoss: 105, units: 40 }), 200, [], 1000)).toEqual([]);
  });

  it('warns about an order without a stop loss', () => {
    expect(orderWarnings(order({ stopLoss: null }), 200, [], 1000)).toEqual([{ kind: 'noStop' }]);
  });

  it('warns about turning around right after a loss on the other side', () => {
    const lostShort = closedTrade({ exitTime: 600 });
    expect(orderWarnings(order(), 200, [lostShort], 900)).toEqual([{ kind: 'flip' }]);
    // Same side, a win, or 15 market minutes later: no warning.
    expect(orderWarnings(order({ side: 'short', stopLoss: 102 }), 200, [lostShort], 900)).toEqual(
      [],
    );
    expect(orderWarnings(order(), 200, [closedTrade({ pnl: 5 })], 900)).toEqual([]);
    expect(orderWarnings(order(), 200, [lostShort], 600 + 15 * 60)).toEqual([]);
    // Only the last trade closed counts.
    const wonLong = closedTrade({ side: 'long', pnl: 3, exitTime: 800 });
    expect(orderWarnings(order(), 200, [lostShort, wonLong], 900)).toEqual([]);
  });

  it('lists every warning that applies', () => {
    const kinds = orderWarnings(order({ stopLoss: null }), 200, [closedTrade({})], 900).map(
      (w) => w.kind,
    );
    expect(kinds).toEqual(['noStop', 'flip']);
  });
});
