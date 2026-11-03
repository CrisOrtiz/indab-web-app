import { PracticeSession, PracticeTrade } from '../../core/models/practice';
import { shownStatus } from '../practice/resume';
import { SessionStats, sessionStats } from '../practice/stats';

/** One assigned student's line in an evaluation's ranking. */
export interface EvaluationStanding {
  /** Null for students who have not taken it. */
  rank: number | null;
  uid: string;
  name: string;
  status: 'finished' | 'active' | 'notStarted';
  balance: number | null;
  pnl: number | null;
  /** P/L over the starting balance. */
  return: number | null;
  trades: number | null;
  /** The attempt's session, for staff to adjust; null when not taken. */
  sessionId: string | null;
  /** The attempt is still open (active), even if its time is up: staff can add minutes. */
  open: boolean;
  /** Minutes staff added to it. */
  extraMinutes: number;
  /** How the attempt traded (drawdown, risk...), when its trades were loaded. */
  stats: SessionStats | null;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

const returnOf = (session: PracticeSession) =>
  session.startingBalance > 0 ? session.pnl / session.startingBalance : 0;

/**
 * Ranks an evaluation's attempts by P/L (every attempt starts with the same balance), with
 * fewer trades first on a tie. Attempts still `active` count with what they had closed: the
 * student is still trading, or left it open (once its time is up it shows as finished, and is
 * closed the next time the student opens the practice page). Assigned students without an
 * attempt follow, unranked. With each attempt's `trades` (by session id), rows carry their
 * statistics.
 */
export function evaluationStandings(
  sessions: PracticeSession[],
  students: { uid: string; name: string }[] = [],
  now = Date.now(),
  trades?: Map<string, PracticeTrade[]>,
): EvaluationStanding[] {
  const ranked: EvaluationStanding[] = [...sessions]
    .sort((a, b) => b.pnl - a.pnl || a.tradeCount - b.tradeCount || byName(nameOf(a), nameOf(b)))
    .map((s, i) => ({
      rank: i + 1,
      uid: s.uid,
      name: s.userName,
      status: shownStatus(s, now),
      balance: s.balance,
      pnl: s.pnl,
      return: returnOf(s),
      trades: s.tradeCount,
      sessionId: s.id,
      open: s.status === 'active',
      extraMinutes: s.extraMinutes ?? 0,
      stats: trades?.has(s.id) ? sessionStats(trades.get(s.id)!, s.startingBalance) : null,
    }));
  const taken = new Set(sessions.map((s) => s.uid));
  const missing: EvaluationStanding[] = students
    .filter((student) => !taken.has(student.uid))
    .sort(byName)
    .map((student) => ({
      rank: null,
      uid: student.uid,
      name: student.name,
      status: 'notStarted',
      balance: null,
      pnl: null,
      return: null,
      trades: null,
      sessionId: null,
      open: false,
      extraMinutes: 0,
      stats: null,
    }));
  return [...ranked, ...missing];
}

const nameOf = (session: PracticeSession) => ({ name: session.userName });
