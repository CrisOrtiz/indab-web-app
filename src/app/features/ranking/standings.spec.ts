import { Timestamp } from 'firebase/firestore';
import { PracticeSession } from '../../core/models/practice';
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
});
