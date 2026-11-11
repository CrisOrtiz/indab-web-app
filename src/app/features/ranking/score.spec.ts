import { PracticeTrade } from '../../core/models/practice';
import {
  indabScore,
  journalPoints,
  resultPoints,
  riskPoints,
  rubricPoints,
  tradingRecord,
} from './score';

/** A closed long from 100 that risks 2 USD a unit to its stop at 98. */
const closed = (pnl: number, extra: Partial<PracticeTrade> = {}) =>
  ({
    status: 'closed',
    side: 'long',
    entryPrice: 100,
    entryTime: 0,
    quantity: 1,
    stopLoss: 98,
    initialStopLoss: 98,
    takeProfit: 104,
    exitTime: 60,
    exitReason: 'manual',
    pnl,
    ...extra,
  }) as PracticeTrade;
/** The same trade an hour later. */
const later = (pnl: number, extra: Partial<PracticeTrade> = {}) =>
  closed(pnl, { entryTime: 3600, exitTime: 3660, ...extra });
const all = (n: number) => ({ plan: n, context: n, management: n, emotions: n });

describe('INDAB score', () => {
  it('gives 50 result points at 0 R, 0 and 100 at -5 R and +5 R', () => {
    expect(resultPoints(0)).toBe(50);
    expect(resultPoints(2)).toBe(70);
    expect(resultPoints(9)).toBe(100);
    expect(resultPoints(-5)).toBe(0);
    expect(resultPoints(-9)).toBe(0);
  });

  it('measures the result in R: P/L over what each trade risked to its stop', () => {
    // +4 on 2 risked = 2 R; -2 on 2 = -1 R.
    expect(tradingRecord([closed(4), later(-2)], 200).r).toBeCloseTo(1);
    // The same +4 with ten times the stop is 0.2 R: a big win from a big risk is worth less.
    expect(tradingRecord([closed(4, { stopLoss: 80, initialStopLoss: 80 })], 200).r).toBeCloseTo(
      0.2,
    );
    // A stop widened later counts the wider one.
    expect(tradingRecord([closed(4, { stopLoss: 96 })], 200).r).toBeCloseTo(1);
    // Without a stop it counts as if it risked 15 % of 200 = 30 USD.
    expect(
      tradingRecord([closed(30, { stopLoss: null, initialStopLoss: null })], 200).r,
    ).toBeCloseTo(1);
  });

  it('takes risk points off for missing stops, oversized trades, open risk and drawdown', () => {
    const risk = (trades: PracticeTrade[]) => riskPoints(tradingRecord(trades, 200));
    // 2 USD risked of 200 (1 %), no drawdown: full marks.
    expect(risk([closed(4)])).toBe(100);
    // A trade without stop loss: -20.
    expect(risk([closed(4), later(2, { stopLoss: null, initialStopLoss: null })])).toBe(80);
    // 10 USD a unit on 3.2 units of 200 = 16 %: 1 point over 15 % = -5, and the same open at
    // once = -5.
    expect(risk([closed(4, { stopLoss: 90, initialStopLoss: 90, quantity: 3.2 })])).toBeCloseTo(90);
    // 40 USD of 200 = 20 %: 5 over 15 % = -25 twice.
    expect(risk([closed(4, { stopLoss: 90, initialStopLoss: 90, quantity: 4 })])).toBeCloseTo(50);
    // Each trade over 15 % costs: two at 20 %, an hour apart, = -25 each, -25 open at once.
    expect(
      risk([
        closed(0, { stopLoss: 90, initialStopLoss: 90, quantity: 4 }),
        later(0, { stopLoss: 90, initialStopLoss: 90, quantity: 4 }),
      ]),
    ).toBeCloseTo(25);
    // 70 USD of 200 = 35 %: 20 over = -100 twice: 0.
    expect(risk([closed(4, { stopLoss: 90, initialStopLoss: 90, quantity: 7 })])).toBe(0);
    // Three trades of 6 % each open at once: 18 %, 3 over 15 % = -15.
    const together = {
      quantity: 2,
      stopLoss: 94,
      initialStopLoss: 94,
      entryTime: 0,
      exitTime: 600,
    };
    expect(risk([closed(1, together), closed(1, together), closed(1, together)])).toBeCloseTo(
      100 - 3 * 5,
    );
    // Down 30 USD from 200 = 15 % drawdown: 5 over 10 % = -10.
    expect(risk([closed(-30, { stopLoss: 99.9, initialStopLoss: 99.9 })])).toBeCloseTo(90);
  });

  it('leaves risk control at 0 after a stop out', () => {
    expect(riskPoints(tradingRecord([closed(-50, { exitReason: 'stopOut' })], 200))).toBe(0);
  });

  it('maps the rubric from 1 to 5 onto 0 to 100', () => {
    expect(rubricPoints(all(1))).toBe(0);
    expect(rubricPoints(all(3))).toBe(50);
    expect(rubricPoints(all(5))).toBe(100);
  });

  it("scores the journal by the mentor's 1-10, on the share of trades with a reason", () => {
    const why = { journal: 'Rechazo en soporte H1' };
    expect(journalPoints([], 10)).toBe(0);
    // Nothing written: 0, whatever the mentor gave.
    expect(journalPoints([closed(4), later(2)], 10)).toBe(0);
    expect(journalPoints([closed(4, why), later(2, why)], 10)).toBe(100);
    expect(journalPoints([closed(4, why), later(2, why)], 7)).toBeCloseTo(70);
    // Half the trades with a reason, rated 8: 40.
    expect(journalPoints([closed(4, why), later(2)], 8)).toBeCloseTo(40);
    // Too short to count.
    expect(journalPoints([closed(4, why), later(2, { journal: ' compra ' })], 10)).toBe(50);
    // Not rated yet: 0.
    expect(journalPoints([closed(4, why), later(2, why)])).toBe(0);
  });

  it('weighs 25 % result, 25 % risk, 15 % discipline, 25 % rubric and 10 % journal', () => {
    const why = { journal: 'Ruptura y retesteo' };
    // +4 and +2 on 2 risked = 3 R = 80; no faults; rubric 5 = 100; both journaled, rated 10.
    const score = indabScore([closed(4, why), later(2, why)], 200, { ...all(5), journal: 10 });
    expect(score).toEqual({
      score: 95,
      parts: { result: 80, risk: 100, discipline: 100, rubric: 100, journal: 100 },
      verdict: 'passed',
      failedBy: [],
    });
    // Rubric 1: 70, which passes at the default 70 but not at an evaluation's 75.
    const low = { ...all(1), journal: 10 };
    expect(indabScore([closed(4, why), later(2, why)], 200, low).verdict).toBe('passed');
    expect(indabScore([closed(4, why), later(2, why)], 200, low, 75).verdict).toBe('failed');
  });

  it('averages rubrics saved with the criteria before 2026-11-11', () => {
    expect(rubricPoints({ plan: 5, risk: 5, stops: 5, context: 5, discipline: 1 })).toBe(80);
  });

  it('leaves attempts without a closed trade unrated', () => {
    expect(indabScore([], 200, all(5)).verdict).toBe('unrated');
    expect(
      indabScore([closed(4, { status: 'open', exitTime: undefined })], 200, all(5)).verdict,
    ).toBe('unrated');
    expect(indabScore([closed(4)], 200, all(5)).verdict).toBe('passed');
  });

  it('fails only a stop out, keeping its score; a deep loss or removed stop cost points', () => {
    const why = { journal: 'Ruptura y retesteo' };
    const stoppedOut = indabScore(
      [closed(4, why), later(-90, { ...why, exitReason: 'stopOut' })],
      200,
      all(5),
    );
    expect(stoppedOut).toMatchObject({ verdict: 'failed', failedBy: ['stopOut'] });
    expect(stoppedOut.score).toBeGreaterThan(0);
    // 200 down to 110 = 45 %: -40 risk points (and drawdown), but no fail.
    const deep = indabScore(
      [
        closed(-90, { ...why, stopLoss: 10, initialStopLoss: 10 }),
        later(1, { ...why, stopLoss: 99.9, initialStopLoss: 99.9 }),
      ],
      200,
      all(5),
    );
    expect(deep.failedBy).toEqual([]);
    expect(
      riskPoints(tradingRecord([closed(-90, { stopLoss: 10, initialStopLoss: 10 })], 200)),
    ).toBe(0);
    expect(
      riskPoints({
        ...tradingRecord([closed(4)], 200),
        maxLossPct: 0.45,
      }),
    ).toBe(60);
    // Exactly 40 % is not a deep loss.
    expect(riskPoints({ ...tradingRecord([closed(4)], 200), maxLossPct: 0.4 })).toBe(100);
    // Placed with a stop, closed without it: -40 discipline on that trade, no fail.
    const removed = indabScore([closed(4, why), later(4, { ...why, stopLoss: null })], 200, all(5));
    expect(removed).toMatchObject({ verdict: 'passed', failedBy: [] });
    expect(removed.parts.discipline).toBe(60);
  });
});
