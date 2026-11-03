import { PracticeTrade } from '../../core/models/practice';
import { sessionStats } from '../practice/stats';
import { indabScore, returnPoints, riskPoints, rubricPoints } from './score';

const closed = (pnl: number, extra: Partial<PracticeTrade> = {}) =>
  ({
    status: 'closed',
    side: 'long',
    entryPrice: 100,
    entryTime: 0,
    quantity: 1,
    stopLoss: 98,
    takeProfit: 104,
    exitTime: 1,
    exitReason: 'manual',
    pnl,
    ...extra,
  }) as PracticeTrade;

describe('INDAB score', () => {
  it('gives 50 return points at break-even, 0 and 100 at -20 % and +20 %', () => {
    expect(returnPoints(0)).toBe(50);
    expect(returnPoints(0.1)).toBe(75);
    expect(returnPoints(0.5)).toBe(100);
    expect(returnPoints(-0.2)).toBe(0);
    expect(returnPoints(-0.9)).toBe(0);
  });

  it('takes risk points off for missing stops, oversized trades and deep drawdown', () => {
    // 2 USD risked of 200 (1 %), no drawdown: full marks.
    expect(riskPoints(sessionStats([closed(4)], 200))).toBe(100);
    // A trade without stop loss: -20.
    expect(riskPoints(sessionStats([closed(4), closed(2, { stopLoss: null })], 200))).toBe(80);
    // 10 USD risked a unit on 2 units from 200 = 10 %: 8 points over 2 % = -80.
    expect(riskPoints(sessionStats([closed(4, { stopLoss: 90, quantity: 2 })], 200))).toBe(20);
    // Down 30 USD from 200 = 15 % drawdown: 5 over 10 % = -10.
    expect(riskPoints(sessionStats([closed(-30, { stopLoss: 99.9 })], 200))).toBeCloseTo(90);
  });

  it('leaves risk control at 0 after a stop out', () => {
    expect(riskPoints(sessionStats([closed(-50, { exitReason: 'stopOut' })], 200))).toBe(0);
  });

  it('maps the rubric from 1 to 5 onto 0 to 100', () => {
    const all = (n: number) => ({ plan: n, risk: n, stops: n, context: n, discipline: n });
    expect(rubricPoints(all(1))).toBe(0);
    expect(rubricPoints(all(3))).toBe(50);
    expect(rubricPoints(all(5))).toBe(100);
  });

  it('weighs 40 % return, 30 % risk and 30 % rubric', () => {
    const score = indabScore(0.1, sessionStats([closed(20)], 200), {
      plan: 5,
      risk: 4,
      stops: 4,
      context: 3,
      discipline: 4,
    });
    // Return 75, risk 100, rubric (4 - 1) / 4 = 75.
    expect(score).toEqual({ score: 82.5, parts: { return: 75, risk: 100, rubric: 75 } });
  });
});
