import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-indab-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin'), { uid: 'admin', role: 'admin' });
    await setDoc(doc(db, 'users/student'), { uid: 'student', role: 'student', displayName: 'Ana' });
    await setDoc(doc(db, 'enrollments/enrolled'), { academy: true, courses: [] });
    await setDoc(doc(db, 'enrollments/partial'), { academy: false, courses: ['forex-101'] });
    await setDoc(doc(db, 'materials/m1'), { title: 'Gestión de riesgo' });
    await setDoc(doc(db, 'courses/forex-101'), { title: 'Forex 101', published: true });
    await setDoc(doc(db, 'courses/draft'), { title: 'Borrador', published: false });
    await setDoc(doc(db, 'courses/forex-101/lessons/l1'), { title: 'Lección 1' });
    await setDoc(doc(db, 'investors/investor'), { balance: 1000 });
  });
});

const as = (uid: string | null) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

describe('users', () => {
  it('lets a user create their own student profile', async () => {
    await assertSucceeds(
      setDoc(doc(as('new'), 'users/new'), {
        uid: 'new',
        email: 'a@b.co',
        displayName: 'Nuevo',
        role: 'student',
        createdAt: new Date(),
      }),
    );
  });

  it('blocks creating a profile with the admin role', async () => {
    await assertFails(
      setDoc(doc(as('new'), 'users/new'), {
        uid: 'new',
        email: 'a@b.co',
        displayName: 'Nuevo',
        role: 'admin',
        createdAt: new Date(),
      }),
    );
  });

  it('blocks self-promotion and reading other profiles', async () => {
    await assertFails(updateDoc(doc(as('student'), 'users/student'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(as('student'), 'users/student'), { displayName: 'Ana M.' }));
    await assertFails(getDoc(doc(as('student'), 'users/admin')));
  });
});

describe('user profiles', () => {
  const profile = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    email: 'a@b.co',
    displayName: 'Nuevo',
    role: 'student',
    createdAt: new Date(),
    ...extra,
  });

  it('only lets a user create the profile for their own uid', async () => {
    await assertFails(setDoc(doc(as(null), 'users/new'), profile('new')));
    await assertFails(setDoc(doc(as('new'), 'users/other'), profile('other')));
    await assertFails(setDoc(doc(as('new'), 'users/new'), profile('other')));
  });

  it('validates the new profile shape', async () => {
    await assertFails(setDoc(doc(as('new'), 'users/new'), profile('new', { extra: true })));
    await assertFails(setDoc(doc(as('new'), 'users/new'), profile('new', { displayName: 42 })));
    await assertFails(
      setDoc(doc(as('new'), 'users/new'), profile('new', { displayName: 'x'.repeat(81) })),
    );
    await assertSucceeds(
      setDoc(doc(as('new'), 'users/new'), profile('new', { displayName: 'x'.repeat(80) })),
    );
  });

  it('lets owners edit only a valid display name', async () => {
    const own = doc(as('student'), 'users/student');
    await assertFails(updateDoc(own, { displayName: 'x'.repeat(81) }));
    await assertFails(updateDoc(own, { email: 'otro@b.co' }));
    await assertFails(updateDoc(own, { uid: 'admin' }));
    await assertFails(updateDoc(own, { displayName: 'Ana', role: 'admin' }));
  });

  it('keeps profiles private and only admins delete them', async () => {
    await assertFails(getDoc(doc(as(null), 'users/student')));
    await assertSucceeds(getDoc(doc(as('student'), 'users/student')));
    await assertSucceeds(getDoc(doc(as('admin'), 'users/student')));
    await assertFails(updateDoc(doc(as('student'), 'users/admin'), { displayName: 'x' }));
    await assertFails(deleteDoc(doc(as('student'), 'users/student')));
    await assertSucceeds(deleteDoc(doc(as('admin'), 'users/student')));
  });
});

describe('enrollments', () => {
  it('is readable by its owner and writable only by admins', async () => {
    await assertSucceeds(getDoc(doc(as('enrolled'), 'enrollments/enrolled')));
    await assertFails(
      setDoc(doc(as('student'), 'enrollments/student'), { academy: true, courses: [] }),
    );
    await assertSucceeds(
      setDoc(doc(as('admin'), 'enrollments/student'), { academy: true, courses: [] }),
    );
  });
});

describe('admin user management', () => {
  it('lets only admins list users and enrollments', async () => {
    await assertSucceeds(getDocs(collection(as('admin'), 'users')));
    await assertSucceeds(getDocs(collection(as('admin'), 'enrollments')));
    await assertFails(getDocs(collection(as('student'), 'users')));
    await assertFails(getDocs(collection(as('enrolled'), 'enrollments')));
    await assertFails(getDocs(collection(as(null), 'users')));
  });

  it("lets admins change other users' roles, and nothing else", async () => {
    await assertSucceeds(updateDoc(doc(as('admin'), 'users/student'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(as('admin'), 'users/student'), { role: 'student' }));
    await assertFails(updateDoc(doc(as('admin'), 'users/student'), { role: 'owner' }));
    await assertFails(updateDoc(doc(as('admin'), 'users/student'), { email: 'x@y.co' }));
    await assertFails(updateDoc(doc(as('enrolled'), 'users/student'), { role: 'admin' }));
  });

  it('blocks admins from removing their own admin role', async () => {
    await assertFails(updateDoc(doc(as('admin'), 'users/admin'), { role: 'student' }));
  });

  it('lets admins grant and revoke academy access with a valid enrollment', async () => {
    const grant = { academy: true, courses: [], updatedAt: new Date(), updatedBy: 'admin' };
    await assertSucceeds(setDoc(doc(as('admin'), 'enrollments/student'), grant));
    await assertSucceeds(
      setDoc(doc(as('admin'), 'enrollments/student'), { ...grant, academy: false }),
    );
    await assertSucceeds(deleteDoc(doc(as('admin'), 'enrollments/student')));
    await assertFails(
      setDoc(doc(as('admin'), 'enrollments/student'), { ...grant, academy: 'yes' }),
    );
    await assertFails(setDoc(doc(as('admin'), 'enrollments/student'), { ...grant, extra: 1 }));
    await assertFails(
      setDoc(doc(as('admin'), 'enrollments/student'), { ...grant, updatedBy: 'someone' }),
    );
    await assertFails(
      setDoc(doc(as('student'), 'enrollments/student'), { ...grant, updatedBy: 'student' }),
    );
    await assertFails(deleteDoc(doc(as('enrolled'), 'enrollments/enrolled')));
  });
});

describe('enrollment privacy', () => {
  it("hides other users' enrollments", async () => {
    await assertFails(getDoc(doc(as(null), 'enrollments/enrolled')));
    await assertFails(getDoc(doc(as('student'), 'enrollments/enrolled')));
    await assertSucceeds(getDoc(doc(as('admin'), 'enrollments/enrolled')));
  });

  it('blocks owners from editing their own enrollment', async () => {
    await assertFails(updateDoc(doc(as('partial'), 'enrollments/partial'), { academy: true }));
    await assertFails(
      updateDoc(doc(as('partial'), 'enrollments/partial'), { courses: ['forex-101', 'pro'] }),
    );
  });

  it('requires courses to be a list', async () => {
    await assertFails(
      setDoc(doc(as('admin'), 'enrollments/student'), { academy: true, courses: 'forex-101' }),
    );
  });
});

describe('learning material', () => {
  it('is readable only by enrolled users and admins', async () => {
    await assertFails(getDoc(doc(as(null), 'materials/m1')));
    await assertFails(getDoc(doc(as('student'), 'materials/m1')));
    await assertFails(getDoc(doc(as('partial'), 'materials/m1')));
    await assertSucceeds(getDoc(doc(as('enrolled'), 'materials/m1')));
    await assertSucceeds(getDoc(doc(as('admin'), 'materials/m1')));
    await assertFails(setDoc(doc(as('enrolled'), 'materials/m2'), { title: 'x' }));
  });

  it('is managed by admins only', async () => {
    await assertSucceeds(setDoc(doc(as('admin'), 'materials/m2'), { title: 'Nuevo' }));
    await assertSucceeds(deleteDoc(doc(as('admin'), 'materials/m2')));
    await assertFails(deleteDoc(doc(as('enrolled'), 'materials/m1')));
    await assertFails(getDocs(collection(as('student'), 'materials')));
    await assertSucceeds(getDocs(collection(as('enrolled'), 'materials')));
  });
});

describe('courses', () => {
  it('shows published courses publicly and gates lessons by enrollment', async () => {
    await assertSucceeds(getDoc(doc(as(null), 'courses/forex-101')));
    await assertFails(getDoc(doc(as(null), 'courses/draft')));
    await assertFails(getDoc(doc(as('student'), 'courses/forex-101/lessons/l1')));
    await assertSucceeds(getDoc(doc(as('partial'), 'courses/forex-101/lessons/l1')));
    await assertSucceeds(getDoc(doc(as('enrolled'), 'courses/forex-101/lessons/l1')));
  });

  it('limits course enrollment to the listed courses', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'courses/draft/lessons/l1'), { title: 'Oculta' }),
    );
    await assertFails(getDoc(doc(as('partial'), 'courses/draft/lessons/l1')));
    await assertSucceeds(getDoc(doc(as('enrolled'), 'courses/draft/lessons/l1')));
    await assertFails(getDoc(doc(as(null), 'courses/forex-101/lessons/l1')));
  });

  it('shows drafts to admins and lets only admins edit courses and lessons', async () => {
    await assertFails(getDoc(doc(as('enrolled'), 'courses/draft')));
    await assertSucceeds(getDoc(doc(as('admin'), 'courses/draft')));
    await assertFails(updateDoc(doc(as('enrolled'), 'courses/forex-101'), { published: false }));
    await assertFails(setDoc(doc(as('enrolled'), 'courses/forex-101/lessons/l2'), { title: 'x' }));
    await assertSucceeds(updateDoc(doc(as('admin'), 'courses/draft'), { published: true }));
    await assertSucceeds(setDoc(doc(as('admin'), 'courses/forex-101/lessons/l2'), { title: 'x' }));
  });
});

describe('investors', () => {
  it('lets investors read only their own account', async () => {
    await assertSucceeds(getDoc(doc(as('investor'), 'investors/investor')));
    await assertFails(getDoc(doc(as('student'), 'investors/investor')));
    await assertFails(setDoc(doc(as('investor'), 'investors/investor'), { balance: 1e9 }));
  });

  it('is managed by admins and hidden from visitors', async () => {
    await assertFails(getDoc(doc(as(null), 'investors/investor')));
    await assertFails(getDocs(collection(as('investor'), 'investors')));
    await assertSucceeds(getDoc(doc(as('admin'), 'investors/investor')));
    await assertSucceeds(updateDoc(doc(as('admin'), 'investors/investor'), { balance: 1100 }));
    await assertFails(setDoc(doc(as('new'), 'investors/new'), { balance: 1 }));
  });
});

describe('trading practice', () => {
  const session = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    userName: 'Ana',
    symbol: 'BTCUSDT',
    interval: '1h',
    replayStart: 1_620_000_000_000,
    startingBalance: 10000,
    balance: 10000,
    pnl: 0,
    tradeCount: 0,
    status: 'active',
    startedAt: serverTimestamp(),
    ...extra,
  });
  const trade = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    side: 'long',
    quantity: 0.02,
    entryPrice: 50000.5,
    entryTime: 1_620_000_000,
    stopLoss: 49000,
    takeProfit: null,
    status: 'open',
    openedAt: serverTimestamp(),
    ...extra,
  });
  const close = (extra: Record<string, unknown> = {}) => ({
    status: 'closed',
    exitPrice: 51000,
    exitTime: 1_620_003_600,
    exitReason: 'manual',
    pnl: 19.99,
    closedAt: serverTimestamp(),
    ...extra,
  });
  const sessionRef = (uid: string | null, id = 's1') => doc(as(uid), `practiceSessions/${id}`);
  const tradeRef = (uid: string | null, id = 't1', sessionId = 's1') =>
    doc(as(uid), `practiceSessions/${sessionId}/trades/${id}`);

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'enrollments/other'), { academy: true, courses: [] });
      await setDoc(doc(db, 'practiceSessions/s1'), {
        ...session('enrolled'),
        startedAt: new Date(),
      });
      await setDoc(doc(db, 'practiceSessions/s1/trades/t1'), {
        ...trade('enrolled'),
        openedAt: new Date(),
      });
      await setDoc(doc(db, 'practiceSessions/done'), {
        ...session('enrolled'),
        status: 'finished',
        startedAt: new Date(),
      });
    });
  });

  it('lets students with academy access start their own session', async () => {
    await assertSucceeds(setDoc(sessionRef('enrolled', 'new'), session('enrolled')));
    await assertSucceeds(setDoc(sessionRef('admin', 'new2'), session('admin')));
    await assertFails(setDoc(sessionRef('partial', 'new3'), session('partial')));
    await assertFails(setDoc(sessionRef('student', 'new4'), session('student')));
    await assertFails(setDoc(sessionRef(null, 'new5'), session('enrolled')));
  });

  it('validates a new session', async () => {
    const create = (extra: Record<string, unknown>) =>
      setDoc(sessionRef('enrolled', 'new'), session('enrolled', extra));
    await assertFails(setDoc(sessionRef('enrolled', 'new'), session('other')));
    await assertFails(create({ status: 'finished' }));
    await assertFails(create({ pnl: 500 }));
    await assertFails(create({ balance: 1_000_000 }));
    await assertFails(create({ interval: '1s' }));
    await assertFails(create({ startedAt: new Date(2020, 0, 1) }));
    await assertFails(create({ grade: 'A' }));
  });

  it('keeps sessions private to their owner and admins', async () => {
    await assertSucceeds(getDoc(sessionRef('enrolled')));
    await assertSucceeds(getDoc(sessionRef('admin')));
    await assertFails(getDoc(sessionRef('other')));
    await assertFails(getDoc(sessionRef(null)));

    const sessions = (uid: string) => collection(as(uid), 'practiceSessions');
    await assertSucceeds(
      getDocs(
        query(sessions('enrolled'), where('uid', '==', 'enrolled'), orderBy('startedAt', 'desc')),
      ),
    );
    await assertFails(getDocs(sessions('enrolled')));
    await assertSucceeds(getDocs(query(sessions('admin'), orderBy('startedAt', 'desc'))));
  });

  it('lets the owner update the summary and finish the session, once', async () => {
    await assertFails(updateDoc(sessionRef('other'), { pnl: 5 }));
    await assertFails(updateDoc(sessionRef('enrolled'), { symbol: 'ETHUSDT' }));
    await assertFails(updateDoc(sessionRef('enrolled'), { tradeCount: 1.5 }));
    await assertSucceeds(
      updateDoc(sessionRef('enrolled'), { balance: 10020.5, pnl: 20.5, tradeCount: 1 }),
    );
    await assertFails(updateDoc(sessionRef('enrolled'), { status: 'finished' }));
    await assertSucceeds(
      updateDoc(sessionRef('enrolled'), { status: 'finished', endedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(sessionRef('enrolled'), { pnl: 9999 }));
    await assertFails(updateDoc(sessionRef('enrolled', 'done'), { status: 'active' }));
  });

  it('lets only admins delete sessions and trades', async () => {
    await assertFails(deleteDoc(tradeRef('enrolled')));
    await assertFails(deleteDoc(sessionRef('enrolled')));
    await assertSucceeds(deleteDoc(tradeRef('admin')));
    await assertSucceeds(deleteDoc(sessionRef('admin')));
  });

  it('lets the owner open valid trades in an active session', async () => {
    await assertSucceeds(setDoc(tradeRef('enrolled', 't2'), trade('enrolled')));
    await assertSucceeds(
      setDoc(tradeRef('enrolled', 't3'), trade('enrolled', { side: 'short', stopLoss: null })),
    );
    await assertFails(setDoc(tradeRef('other', 't4'), trade('other')));
    await assertFails(setDoc(tradeRef('admin', 't4'), trade('admin')));
    await assertFails(setDoc(tradeRef('enrolled', 't4', 'done'), trade('enrolled')));
    await assertFails(setDoc(tradeRef('enrolled', 't4'), trade('enrolled', { status: 'closed' })));
    await assertFails(setDoc(tradeRef('enrolled', 't4'), trade('enrolled', { side: 'up' })));
    await assertFails(setDoc(tradeRef('enrolled', 't4'), trade('enrolled', { quantity: 0 })));
    await assertFails(setDoc(tradeRef('enrolled', 't4'), trade('enrolled', { stopLoss: -1 })));
    await assertFails(setDoc(tradeRef('enrolled', 't4'), trade('enrolled', { pnl: 100 })));
  });

  it('shows trades to the session owner and admins only', async () => {
    await assertSucceeds(getDocs(collection(as('enrolled'), 'practiceSessions/s1/trades')));
    await assertSucceeds(getDocs(collection(as('admin'), 'practiceSessions/s1/trades')));
    await assertFails(getDocs(collection(as('other'), 'practiceSessions/s1/trades')));
    await assertFails(getDoc(tradeRef(null)));
  });

  it('closes a trade exactly once and never edits its entry', async () => {
    await assertFails(updateDoc(tradeRef('other'), close()));
    await assertFails(updateDoc(tradeRef('enrolled'), { ...close(), entryPrice: 1 }));
    await assertFails(updateDoc(tradeRef('enrolled'), close({ exitReason: 'magic' })));
    await assertFails(updateDoc(tradeRef('enrolled'), close({ exitTime: 1 })));
    await assertFails(updateDoc(tradeRef('enrolled'), { stopLoss: 48000 }));
    await assertSucceeds(updateDoc(tradeRef('enrolled'), close({ exitReason: 'stopLoss' })));
    await assertFails(updateDoc(tradeRef('enrolled'), close({ pnl: 5000 })));
  });
});

describe('unknown collections', () => {
  it('are closed to everyone, admins included', async () => {
    await assertFails(getDoc(doc(as('admin'), 'secrets/s1')));
    await assertFails(setDoc(doc(as('admin'), 'secrets/s1'), { x: 1 }));
    await assertFails(setDoc(doc(as(null), 'logs/l1'), { x: 1 }));
  });
});
