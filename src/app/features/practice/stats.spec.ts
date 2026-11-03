import { PracticeTrade } from '../../core/models/practice';
import { sessionStats } from './stats';

const trade = (id: string, pnl: number, exitTime: number): PracticeTrade => ({
  id,
  uid: 'u',
  side: 'long',
  orderType: 'market',
  orderPrice: null,
  placedTime: 0,
  quantity: 1,
  entryPrice: 100,
  entryTime: 0,
  stopLoss: null,
  takeProfit: null,
  status: 'closed',
  exitPrice: 100 + pnl,
  exitTime,
  exitReason: 'manual',
  pnl,
});

describe('sessionStats', () => {
  it('is empty before any trade closes', () => {
    const open = { ...trade('a', 0, 0), status: 'open' as const };
    expect(sessionStats([open], 200, 5)).toEqual({
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      profitFactor: null,
      avgWin: null,
      avgLoss: null,
      best: null,
      worst: null,
      expectancy: null,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      equity: [{ time: 5, balance: 200 }],
      avgRiskPct: null,
      maxRiskPct: null,
      avgRewardRisk: null,
      withoutStopLoss: 0,
      stoppedOut: false,
    });
  });

  it('summarises closed trades in order of exit, with the deepest drawdown', () => {
    // Balance: 200 → 220 → 210 → 190 → 205 (out of order on purpose).
    const stats = sessionStats(
      [trade('d', 15, 40), trade('a', 20, 10), trade('c', -20, 30), trade('b', -10, 20)],
      200,
    );
    expect(stats.equity.map((p) => p.balance)).toEqual([200, 220, 210, 190, 205]);
    expect(stats).toMatchObject({
      trades: 4,
      wins: 2,
      losses: 2,
      winRate: 0.5,
      profitFactor: round(35 / 30),
      avgWin: 17.5,
      avgLoss: -15,
      best: 20,
      worst: -20,
      expectancy: 1.25,
      maxDrawdown: 30,
    });
    expect(stats.maxDrawdownPct).toBeCloseTo(30 / 220);
  });

  it('measures risk to the stop loss each trade was placed with', () => {
    const stats = sessionStats(
      [
        // Risked 5 USD a unit on 4 units from 200: 10 %. TP 10 away: 1:2. SL moved to entry later.
        { ...trade('a', 40, 10), quantity: 4, initialStopLoss: 95, stopLoss: 100, takeProfit: 110 },
        // Opened after a closed, so from 240: 2 x 6 / 240 = 5 %. No take profit.
        { ...trade('b', -12, 30), entryTime: 20, quantity: 2, stopLoss: 94 },
        // No stop loss at all, closed by the stop out.
        { ...trade('c', -20, 40), entryTime: 35, exitReason: 'stopOut' },
      ],
      200,
    );
    expect(stats.avgRiskPct).toBeCloseTo(0.075);
    expect(stats.maxRiskPct).toBeCloseTo(0.1);
    expect(stats.avgRewardRisk).toBe(2);
    expect(stats.withoutStopLoss).toBe(1);
    expect(stats.stoppedOut).toBe(true);
  });

  it('has no profit factor without losses', () => {
    expect(sessionStats([trade('a', 5, 1)], 200).profitFactor).toBeNull();
  });
});

function round(value: number) {
  return Math.round(value * 100) / 100;
}
