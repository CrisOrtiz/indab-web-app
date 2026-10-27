/** How far back the dashboard looks. */
export type DashboardPeriod = 'week' | 'month' | 'quarter';

export const PERIODS: DashboardPeriod[] = ['week', 'month', 'quarter'];

/**
 * Where a period starts (local time): this week's Monday at midnight, or midnight 30 or 90 days
 * ago.
 */
export function periodStart(period: DashboardPeriod, now = new Date()): Date {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    // getDay() is 0 on Sunday; weeks start on Monday.
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  } else {
    day.setDate(day.getDate() - (period === 'month' ? 30 : 90));
  }
  return day;
}

/** A student of the mentorship. */
export interface Member {
  uid: string;
  name: string;
  email: string;
  mentorshipIds: string[];
}

/** A student's practice in the period, from aggregation queries (not every session). */
export interface Activity {
  /** Sessions started in the period (free practice and evaluation attempts). */
  sessions: number;
  /** Sum of those sessions' P/L. */
  pnl: number;
  /** Trades closed in the period, and how many of them made money. */
  closedTrades: number;
  wins: number;
  /** Start of the student's latest session ever, or null if they never practised. */
  lastPractice: Date | null;
}

/** A form or practice evaluation given to the group whose window touches the period. */
export interface Delivery {
  kind: 'form' | 'evaluation';
  id: string;
  title: string;
  closesAt: Date;
  /** Still open: missing students can hand it in. */
  open: boolean;
  /** Members it is assigned to. */
  assigned: string[];
  /** Members who handed it in (forms) or made their attempt (evaluations). */
  done: string[];
  /**
   * Forms: each member's best graded score as a share of the total (0-1). Evaluations: each
   * member's attempt P/L.
   */
  results: Record<string, number>;
}

/** One row of the students table. */
export interface StudentRow extends Member {
  /** Null while loading or if it could not be read. */
  activity: Activity | null;
  /** Average of the student's graded forms (0-1), or null if none is graded. */
  examAverage: number | null;
  /** Deliveries assigned to the student that they have not handed in. */
  pending: Delivery[];
}

/** Winning share of closed trades (0-1), or null without trades. */
export const winRate = (wins: number, closed: number): number | null =>
  closed > 0 ? wins / closed : null;

const average = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/** Joins members with their activity and their part in each delivery. */
export function studentRows(
  members: Member[],
  activity: ReadonlyMap<string, Activity>,
  deliveries: Delivery[],
): StudentRow[] {
  return members.map((m) => ({
    ...m,
    activity: activity.get(m.uid) ?? null,
    examAverage: average(
      deliveries
        .filter((d) => d.kind === 'form' && m.uid in d.results)
        .map((d) => d.results[m.uid]),
    ),
    pending: deliveries.filter((d) => d.assigned.includes(m.uid) && !d.done.includes(m.uid)),
  }));
}

/** The group's figures above the table. */
export interface GroupSummary {
  students: number;
  /** Students with at least one session in the period. */
  practiced: number;
  sessions: number;
  /** Average P/L of the students who practised, or null if nobody did. */
  averagePnl: number | null;
  winRate: number | null;
  /** Average of every graded form of the group (0-1). */
  examAverage: number | null;
  /** Average P/L of the group's evaluation attempts. */
  evaluationAverage: number | null;
  /** Assigned forms and evaluations not handed in, summed over students. */
  pending: number;
}

export function groupSummary(rows: StudentRow[], deliveries: Delivery[]): GroupSummary {
  const active = rows.filter((r) => (r.activity?.sessions ?? 0) > 0);
  const sum = (pick: (a: Activity) => number) =>
    rows.reduce((total, r) => total + (r.activity ? pick(r.activity) : 0), 0);
  const memberIds = new Set(rows.map((r) => r.uid));
  const results = (kind: Delivery['kind']) =>
    deliveries
      .filter((d) => d.kind === kind)
      .flatMap((d) =>
        Object.entries(d.results)
          .filter(([uid]) => memberIds.has(uid))
          .map(([, value]) => value),
      );
  return {
    students: rows.length,
    practiced: active.length,
    sessions: sum((a) => a.sessions),
    averagePnl: average(active.map((r) => r.activity!.pnl)),
    winRate: winRate(
      sum((a) => a.wins),
      sum((a) => a.closedTrades),
    ),
    examAverage: average(results('form')),
    evaluationAverage: average(results('evaluation')),
    pending: rows.reduce((total, r) => total + r.pending.length, 0),
  };
}

/** Whether a window that opened at `opensAt` and closes at `closesAt` matters for the period. */
export const inPeriod = (opensAt: Date, closesAt: Date, from: Date, now: Date): boolean =>
  opensAt <= now && closesAt >= from;
