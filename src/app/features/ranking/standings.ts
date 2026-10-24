import { PracticeSession } from '../../core/models/practice';

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
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

const returnOf = (session: PracticeSession) =>
  session.startingBalance > 0 ? session.pnl / session.startingBalance : 0;

/**
 * Ranks an evaluation's attempts by P/L (every attempt starts with the same balance), with
 * fewer trades first on a tie. Attempts still `active` count with what they had closed: the
 * student is still trading, or left without finishing. Assigned students without an attempt
 * follow, unranked.
 */
export function evaluationStandings(
  sessions: PracticeSession[],
  students: { uid: string; name: string }[] = [],
): EvaluationStanding[] {
  const ranked: EvaluationStanding[] = [...sessions]
    .sort((a, b) => b.pnl - a.pnl || a.tradeCount - b.tradeCount || byName(nameOf(a), nameOf(b)))
    .map((s, i) => ({
      rank: i + 1,
      uid: s.uid,
      name: s.userName,
      status: s.status,
      balance: s.balance,
      pnl: s.pnl,
      return: returnOf(s),
      trades: s.tradeCount,
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
    }));
  return [...ranked, ...missing];
}

const nameOf = (session: PracticeSession) => ({ name: session.userName });
