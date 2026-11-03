import { Timestamp } from 'firebase/firestore';
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
      new Map([['a--4', [trade as PracticeTrade]]]),
    );
    expect(rows[1].stats).toMatchObject({ trades: 1, stoppedOut: true });
    expect(rows[0].stats).toBeNull();
  });
});
