import { Timestamp } from 'firebase/firestore';
import { EvaluationGrade } from '../../core/models/evaluation';
import { PracticeSession, PracticeTrade } from '../../core/models/practice';
import { evaluationStandings } from './standings';

const session = (
  uid: string,
  userName: string,
  pnl: number,
  extra: Partial<PracticeSession> = {},
) =>
  ({
    id: `${uid}-${pnl}`,
    uid,
    userName,
    pnl,
    balance: 200 + pnl,
    startingBalance: 200,
    tradeCount: 2,
    status: 'finished',
    endedAt: { toMillis: () => 0 } as Timestamp,
    ...extra,
  }) as PracticeSession;

describe('evaluationStandings', () => {
  it('ranks attempts by P/L, fewer trades first on a tie, then lists who has not taken it', () => {
    const rows = evaluationStandings(
      [
        session('a', 'Ana', 10, { tradeCount: 4 }),
        session('b', 'Bea', 10, { tradeCount: 1 }),
        session('c', 'Carla', 30, { status: 'active' }),
      ],
      [
        { uid: 'a', name: 'Ana' },
        { uid: 'z', name: 'Zoe' },
        { uid: 'd', name: 'Dani' },
      ],
    );
    expect(rows.map((r) => [r.rank, r.name, r.status])).toEqual([
      [1, 'Carla', 'active'],
      [2, 'Bea', 'finished'],
      [3, 'Ana', 'finished'],
      [null, 'Dani', 'notStarted'],
      [null, 'Zoe', 'notStarted'],
    ]);
    expect(rows[0]).toMatchObject({ pnl: 30, return: 0.15, balance: 230, trades: 2 });
    expect(rows[3]).toMatchObject({ pnl: null, return: null, trades: null });
  });

  it('shows an attempt left open past its time as finished', () => {
    const now = Date.now();
    const started = (minutesAgo: number) =>
      ({ toMillis: () => now - minutesAgo * 60_000 }) as Timestamp;
    const rows = evaluationStandings(
      [
        session('a', 'Ana', 5, { status: 'active', durationMinutes: 30, startedAt: started(10) }),
        session('b', 'Bea', 3, { status: 'active', durationMinutes: 30, startedAt: started(45) }),
      ],
      [],
      now,
    );
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ['Ana', 'active'],
      ['Bea', 'finished'],
    ]);
  });

  it('adds the statistics of attempts whose trades are given', () => {
    const trade = { status: 'closed', pnl: -4, exitTime: 1, exitReason: 'stopOut' };
    const rows = evaluationStandings(
      [session('a', 'Ana', -4), session('b', 'Bea', 0)],
      [],
      Date.now(),
      { trades: new Map([['a--4', [trade as PracticeTrade]]]) },
    );
    expect(rows[1].stats).toMatchObject({ trades: 1, stoppedOut: true });
    expect(rows[0].stats).toBeNull();
  });

  it('ranks passed, failed, then unrated attempts by INDAB score, then the rest by P/L', () => {
    const rubric = (n: number) => ({
      uid: '',
      scores: { plan: n, risk: n, stops: n, context: n, discipline: n },
      by: 't',
      byName: 'T',
      updatedAt: null as unknown as Timestamp,
    });
    // Risks 1 USD (0.5 % of 200) to its stop, so each USD is 1 R.
    const trade = (pnl: number, entryTime = 0) =>
      ({
        status: 'closed',
        side: 'long',
        pnl,
        entryPrice: 100,
        entryTime,
        quantity: 1,
        exitTime: entryTime + 60,
        stopLoss: 99,
        initialStopLoss: 99,
        takeProfit: 104,
      }) as PracticeTrade;
    const rows = evaluationStandings(
      [
        session('a', 'Ana', 4),
        session('b', 'Bea', 2),
        session('c', 'Carla', 20),
        session('d', 'Dee', 4),
      ],
      [],
      Date.now(),
      {
        trades: new Map([
          ['a-4', [trade(2), trade(2, 3600)]],
          ['b-2', [trade(1), trade(1, 3600)]],
          ['c-20', [trade(20)]],
          ['d-4', [trade(4)]],
        ]),
        rubrics: new Map([
          ['a', rubric(1)],
          ['b', rubric(5)],
          ['d', rubric(5)],
        ]),
      },
    );
    // No journal. Bea: result 2 R = 70, risk 100, discipline 100, rubric 100 = 82.5, passed.
    // Ana: 4 R = 90, 100, 100, rubric 0 = 62.5, failed. Dee: one trade, unrated. Carla: no rubric.
    expect(rows.map((r) => [r.rank, r.name, r.score?.score ?? null, r.score?.verdict])).toEqual([
      [1, 'Bea', 82.5, 'passed'],
      [2, 'Ana', 62.5, 'failed'],
      [3, 'Dee', 87.5, 'unrated'],
      [4, 'Carla', null, undefined],
    ]);
    expect(rows[0].marks).toEqual([]);
  });

  it('uses the saved scores when trades and rubrics are not loaded', () => {
    const saved = (score: number, extra: Partial<EvaluationGrade> = {}): EvaluationGrade => ({
      score,
      parts: { result: 60, risk: 90, discipline: 100, rubric: 85 },
      by: 't',
      updatedAt: null as unknown as Timestamp,
      ...extra,
    });
    const rows = evaluationStandings(
      [session('a', 'Ana', 40), session('b', 'Bea', 10), session('c', 'Carla', 5)],
      [],
      0,
      {
        grades: new Map([
          ['b', saved(77, { verdict: 'passed', failedBy: [] })],
          // Saved before verdicts, with the old parts: shown with its score only.
          ['c', { ...saved(60), parts: { return: 60, risk: 90, rubric: 85 } } as never],
        ]),
      },
    );
    expect(rows.map((r) => [r.name, r.score?.score ?? null, r.score?.verdict ?? null])).toEqual([
      ['Bea', 77, 'passed'],
      ['Carla', 60, null],
      ['Ana', null, null],
    ]);
    expect(rows[1].score?.parts).toBeNull();
  });
});
