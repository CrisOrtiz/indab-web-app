import { PracticeTrade } from '../../core/models/practice';

/** One point of the equity curve: the balance after a trade closed. */
export interface EquityPoint {
  time: number;
  balance: number;
}

/** How a session went, as FX Replay and journals summarise it. */
export interface SessionStats {
  trades: number;
  wins: number;
  losses: number;
  /** Share of closed trades that made money; null with no closed trades. */
  winRate: number | null;
  /** Gross profit over gross loss; null when nothing was lost. */
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  best: number | null;
  worst: number | null;
  /** Average P/L per trade. */
  expectancy: number | null;
  /** Largest fall of the balance from a previous high, in USD and as a share of that high. */
  maxDrawdown: number;
  maxDrawdownPct: number;
  /** Starting balance, then the balance after each closed trade, in order of exit. */
  equity: EquityPoint[];
}

const round = (value: number) => Math.round(value * 100) / 100;
const average = (values: number[]) =>
  values.length ? round(values.reduce((sum, v) => sum + v, 0) / values.length) : null;

/** Statistics of the closed trades of a session. */
export function sessionStats(
  trades: PracticeTrade[],
  startingBalance: number,
  startTime = 0,
): SessionStats {
  const closed = trades
    .filter((t) => t.status === 'closed')
    .sort((a, b) => (a.exitTime ?? 0) - (b.exitTime ?? 0));
  const pnls = closed.map((t) => t.pnl ?? 0);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossProfit = wins.reduce((sum, p) => sum + p, 0);
  const grossLoss = -losses.reduce((sum, p) => sum + p, 0);

  const equity: EquityPoint[] = [{ time: startTime, balance: startingBalance }];
  let balance = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  closed.forEach((t, i) => {
    balance = round(balance + pnls[i]);
    equity.push({ time: t.exitTime ?? startTime, balance });
    peak = Math.max(peak, balance);
    if (peak - balance > maxDrawdown) {
      maxDrawdown = round(peak - balance);
      maxDrawdownPct = (peak - balance) / peak;
    }
  });

  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : null,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
    avgWin: average(wins),
    avgLoss: average(losses),
    best: pnls.length ? Math.max(...pnls) : null,
    worst: pnls.length ? Math.min(...pnls) : null,
    expectancy: average(pnls),
    maxDrawdown,
    maxDrawdownPct,
    equity,
  };
}
