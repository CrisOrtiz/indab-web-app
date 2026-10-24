import { Timestamp } from 'firebase/firestore';
import { PracticeSession } from '../../core/models/practice';
import { evaluationStandings, freeStandings } from './standings';

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

describe('freeStandings', () => {
  it('ranks students by total P/L over their sessions', () => {
    const rows = freeStandings([
      session('ana', 'Ana', 20),
      session('ana', 'Ana', -10),
      session('luis', 'Luis', 15, { tradeCount: 5 }),
      session('eva', 'Eva', -5),
    ]);
    expect(rows.map((r) => [r.rank, r.name, r.pnl])).toEqual([
      [1, 'Luis', 15],
      [2, 'Ana', 10],
      [3, 'Eva', -5],
    ]);
    expect(rows[1]).toMatchObject({
      sessions: 2,
      trades: 4,
      averageReturn: 0.025,
      profitableShare: 0.5,
      best: 20,
    });
  });

  it('breaks ties by average return, then by name', () => {
    const rows = freeStandings([
      session('a', 'Bea', 10),
      session('b', 'Ana', 10),
      // 20 on 100 and -10 on 200: a better average return (7.5%) than 10 on 200 (5%).
      session('c', 'Carla', 20, { startingBalance: 100 }),
      session('c', 'Carla', -10),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Carla', 'Ana', 'Bea']);
  });

  it("uses the student's latest name", () => {
    const rows = freeStandings([
      session('a', 'Ana', 1, { endedAt: { toMillis: () => 1 } as Timestamp }),
      session('a', 'Ana María', 1, { endedAt: { toMillis: () => 2 } as Timestamp }),
    ]);
    expect(rows[0].name).toBe('Ana María');
  });
});

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
});
