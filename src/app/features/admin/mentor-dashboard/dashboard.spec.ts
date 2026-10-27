import {
  Activity,
  Delivery,
  Member,
  groupSummary,
  inPeriod,
  periodStart,
  studentRows,
  winRate,
} from './dashboard';

const member = (uid: string): Member => ({ uid, name: uid, email: '', mentorshipIds: ['m1'] });
const activity = (sessions: number, pnl: number, closedTrades = 0, wins = 0): Activity => ({
  sessions,
  pnl,
  closedTrades,
  wins,
  lastPractice: null,
});
const delivery = (over: Partial<Delivery>): Delivery => ({
  kind: 'form',
  id: 'f1',
  title: 'Examen',
  closesAt: new Date(2026, 9, 30),
  open: true,
  assigned: [],
  done: [],
  results: {},
  ...over,
});

describe('periodStart', () => {
  it('starts the week on Monday at midnight', () => {
    // Wednesday 28 October 2026, 15:30.
    expect(periodStart('week', new Date(2026, 9, 28, 15, 30))).toEqual(new Date(2026, 9, 26));
    // A Sunday still belongs to the week that began six days before.
    expect(periodStart('week', new Date(2026, 10, 1, 9))).toEqual(new Date(2026, 9, 26));
    expect(periodStart('week', new Date(2026, 9, 26, 0, 5))).toEqual(new Date(2026, 9, 26));
  });

  it('goes back 30 or 90 days from today', () => {
    const now = new Date(2026, 9, 28, 15, 30);
    expect(periodStart('month', now)).toEqual(new Date(2026, 8, 28));
    expect(periodStart('quarter', now)).toEqual(new Date(2026, 6, 30));
  });
});

describe('dashboard maths', () => {
  it('computes win rate only with trades', () => {
    expect(winRate(3, 4)).toBe(0.75);
    expect(winRate(0, 0)).toBeNull();
  });

  it('keeps deliveries that touch the period and have opened', () => {
    const from = new Date(2026, 9, 26);
    const now = new Date(2026, 9, 28);
    expect(inPeriod(new Date(2026, 9, 1), new Date(2026, 9, 27), from, now)).toBe(true);
    expect(inPeriod(new Date(2026, 9, 1), new Date(2026, 9, 25), from, now)).toBe(false);
    expect(inPeriod(new Date(2026, 9, 29), new Date(2026, 10, 5), from, now)).toBe(false);
  });

  it('joins each student with their practice, pending work and form grades', () => {
    const form = delivery({ assigned: ['ana', 'luis'], done: ['ana'], results: { ana: 0.8 } });
    const evaluation = delivery({
      kind: 'evaluation',
      id: 'e1',
      open: false,
      assigned: ['ana', 'luis'],
      done: ['luis'],
      results: { luis: 25 },
    });
    const rows = studentRows(
      [member('ana'), member('luis'), member('eva')],
      new Map([
        ['ana', activity(2, 30, 4, 3)],
        ['luis', activity(0, 0)],
      ]),
      [form, evaluation],
    );
    expect(rows.map((r) => [r.uid, r.examAverage, r.pending.map((d) => d.id)])).toEqual([
      ['ana', 0.8, ['e1']],
      ['luis', null, ['f1']],
      ['eva', null, []],
    ]);
    expect(rows[2].activity).toBeNull();

    expect(groupSummary(rows, [form, evaluation])).toEqual({
      students: 3,
      practiced: 1,
      sessions: 2,
      averagePnl: 30,
      winRate: 0.75,
      examAverage: 0.8,
      evaluationAverage: 25,
      pending: 2,
    });
  });

  it('leaves averages empty when nobody practised or was graded', () => {
    const summary = groupSummary(studentRows([member('ana')], new Map(), []), []);
    expect(summary).toMatchObject({
      practiced: 0,
      averagePnl: null,
      winRate: null,
      examAverage: null,
      evaluationAverage: null,
    });
  });
});
