import { PracticeSession } from '../../core/models/practice';
import { summarizePractice } from './practice-summary';

const session = (pnl: number, tradeCount: number) => ({ pnl, tradeCount }) as PracticeSession;

describe('summarizePractice', () => {
  it('adds up P/L and trades and finds the best and worst session', () => {
    expect(summarizePractice([session(12.5, 3), session(-4.2, 2), session(0, 0)])).toEqual({
      sessions: 3,
      profitable: 1,
      trades: 5,
      pnl: 8.3,
      best: 12.5,
      worst: -4.2,
    });
  });

  it('rounds the total to cents', () => {
    expect(summarizePractice([session(0.1, 1), session(0.2, 1)]).pnl).toBe(0.3);
  });

  it('is empty without sessions', () => {
    expect(summarizePractice([])).toEqual({
      sessions: 0,
      profitable: 0,
      trades: 0,
      pnl: 0,
      best: null,
      worst: null,
    });
  });
});
