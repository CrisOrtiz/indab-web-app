import { EvaluationGrade, EvaluationRubric, SavedRubricScores } from '../../core/models/evaluation';
import { PracticeSession, PracticeTrade } from '../../core/models/practice';
import { shownStatus } from '../practice/resume';
import { SessionStats, sessionStats } from '../practice/stats';
import { DisciplineMark, disciplineMarks } from './discipline';
import { IndabScore, Verdict, indabScore } from './score';

/**
 * A score as a row shows it: worked out from the trades and rubric, or saved. Grades saved
 * before verdicts existed have no parts in today's shape and no verdict.
 */
export type ShownScore = Omit<IndabScore, 'parts' | 'verdict'> & {
  /** Grades saved before the journal counted have no `journal` part. */
  parts: (Omit<IndabScore['parts'], 'journal'> & { journal?: number }) | null;
  verdict: Verdict | null;
};

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
  /** The mentor's rubric, when staff loaded it and the attempt was rated. */
  rubric: SavedRubricScores | null;
  /** Faults and good habits of its trades, when they were loaded. */
  marks: DisciplineMark[] | null;
  /** The INDAB score: worked out when the trades and rubric are loaded, else the saved one. */
  score: ShownScore | null;
}

/** What is loaded besides the attempts: trades (by session id), rubrics and grades (by student). */
export interface StandingExtras {
  trades?: Map<string, PracticeTrade[]>;
  rubrics?: Map<string, EvaluationRubric>;
  /** Saved scores, for those who cannot read trades and rubrics (students). */
  grades?: Map<string, EvaluationGrade>;
  /** The evaluation's passing score (`passingScoreOf`). */
  passingScore?: number;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

const returnOf = (session: PracticeSession) =>
  session.startingBalance > 0 ? session.pnl / session.startingBalance : 0;

/**
 * Ranks an evaluation's attempts by INDAB score (`score.ts`) where they have one, then by P/L
 * (every attempt starts with the same balance), with fewer trades first on a tie. Attempts
 * still `active` count with what they had closed: the student is still trading, or left it
 * open (once its time is up it shows as finished, and is closed the next time the student
 * opens the practice page). Assigned students without an attempt follow, unranked. With each
 * attempt's `trades` and `rubrics`, rows carry their statistics, the mentor's rating and the
 * score worked out from both; with `grades`, the saved score.
 */
export function evaluationStandings(
  sessions: PracticeSession[],
  students: { uid: string; name: string }[] = [],
  now = Date.now(),
  { trades, rubrics, grades, passingScore }: StandingExtras = {},
): EvaluationStanding[] {
  const rows = sessions.map((s) => {
    const list = trades?.get(s.id);
    const stats = list ? sessionStats(list, s.startingBalance) : null;
    const rubric = rubrics?.get(s.uid)?.scores ?? null;
    const saved = grades?.get(s.uid);
    const score: ShownScore | null =
      list && rubric
        ? indabScore(list, s.startingBalance, rubric, passingScore)
        : saved
          ? {
              score: saved.score,
              parts: saved.verdict ? saved.parts : null,
              verdict: saved.verdict ?? null,
              failedBy: saved.failedBy ?? [],
            }
          : null;
    return { session: s, stats, rubric, marks: list ? disciplineMarks(list) : null, score };
  });
  // Scored attempts first: passed, failed, then unrated, each by score; the rest by P/L, then
  // fewer trades.
  rows.sort(
    (a, b) =>
      (b.score ? 1 : 0) - (a.score ? 1 : 0) ||
      verdictOrder(a.score) - verdictOrder(b.score) ||
      (b.score?.score ?? 0) - (a.score?.score ?? 0) ||
      b.session.pnl - a.session.pnl ||
      a.session.tradeCount - b.session.tradeCount ||
      byName(nameOf(a.session), nameOf(b.session)),
  );
  const ranked: EvaluationStanding[] = rows.map(
    ({ session: s, stats, rubric, marks, score }, i) => ({
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
      stats,
      rubric,
      marks,
      score,
    }),
  );
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
      rubric: null,
      marks: null,
      score: null,
    }));
  return [...ranked, ...missing];
}

/** Where a score's verdict ranks: passed, then failed, then unrated (older grades with passed). */
const verdictOrder = (score: ShownScore | null) =>
  score?.verdict === 'failed' ? 1 : score?.verdict === 'unrated' ? 2 : 0;

const nameOf = (session: PracticeSession) => ({ name: session.userName });
