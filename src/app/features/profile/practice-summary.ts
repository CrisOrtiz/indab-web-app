import { PracticeSession } from '../../core/models/practice';

export interface PracticeSummary {
  sessions: number;
  /** Sessions that ended (or are running) above their starting balance. */
  profitable: number;
  trades: number;
  pnl: number;
  /** Best and worst session P/L; null without sessions. */
  best: number | null;
  worst: number | null;
}

/** Totals of a student's practice sessions for the profile page. */
export function summarizePractice(sessions: PracticeSession[]): PracticeSummary {
  const pnls = sessions.map((s) => s.pnl);
  return {
    sessions: sessions.length,
    profitable: pnls.filter((pnl) => pnl > 0).length,
    trades: sessions.reduce((sum, s) => sum + s.tradeCount, 0),
    // Rounded to cents so float sums never show "-0.00" or "0.30000000000000004".
    pnl: Math.round(pnls.reduce((sum, pnl) => sum + pnl, 0) * 100) / 100,
    best: pnls.length ? Math.max(...pnls) : null,
    worst: pnls.length ? Math.min(...pnls) : null,
  };
}
