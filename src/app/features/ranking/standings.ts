import { PracticeSession } from '../../core/models/practice';

/** One student's line in the free-practice ranking. */
export interface FreeStanding {
  rank: number;
  uid: string;
  name: string;
  sessions: number;
  trades: number;
  /** Sum of the sessions' realized P/L, in USD. */
  pnl: number;
  /** Mean of each session's P/L over its starting balance. */
  averageReturn: number;
  /** Share of sessions that ended in profit. */
  profitableShare: number;
  /** Best single-session P/L. */
  best: number;
}

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
 * Ranks students by the total P/L of their finished free-practice sessions; ties go to the
 * better average return, then by name. Every session starts with the same balance, so total
 * P/L rewards both results and practice; the average return shows quality on its own.
 */
export function freeStandings(sessions: PracticeSession[]): FreeStanding[] {
  const byStudent = new Map<string, PracticeSession[]>();
  for (const session of sessions) {
    byStudent.set(session.uid, [...(byStudent.get(session.uid) ?? []), session]);
  }
  return [...byStudent.entries()]
    .map(([uid, list]) => ({
      rank: 0,
      uid,
      // The latest session carries the current name.
      name: list.reduce((a, b) => (time(b) > time(a) ? b : a)).userName,
      sessions: list.length,
      trades: list.reduce((sum, s) => sum + (s.tradeCount ?? 0), 0),
      pnl: round(list.reduce((sum, s) => sum + s.pnl, 0)),
      averageReturn: list.reduce((sum, s) => sum + returnOf(s), 0) / list.length,
      profitableShare: list.filter((s) => s.pnl > 0).length / list.length,
      best: Math.max(...list.map((s) => s.pnl)),
    }))
    .sort((a, b) => b.pnl - a.pnl || b.averageReturn - a.averageReturn || byName(a, b))
    .map((standing, i) => ({ ...standing, rank: i + 1 }));
}

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
const time = (session: PracticeSession) => session.endedAt?.toMillis() ?? 0;
const round = (value: number) => Math.round(value * 100) / 100;
