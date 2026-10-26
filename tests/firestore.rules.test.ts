import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
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
    await setDoc(doc(db, 'users/trainer'), { uid: 'trainer', role: 'trainer' });
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

// Every test user has confirmed their email (as Google accounts have) unless it says otherwise.
const as = (uid: string | null, emailVerified = true) =>
  (uid
    ? env.authenticatedContext(uid, { email_verified: emailVerified })
    : env.unauthenticatedContext()
  ).firestore();

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

  it('lets owners set, replace and remove a small inline photo', async () => {
    const own = doc(as('student'), 'users/student');
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(40000);
    await assertSucceeds(updateDoc(own, { photoURL: photo }));
    await assertSucceeds(updateDoc(own, { photoURL: 'data:image/png;base64,iVBORw0KGgo=' }));
    await assertSucceeds(updateDoc(own, { displayName: 'Ana M.' }));
    await assertSucceeds(updateDoc(own, { photoURL: deleteField() }));
  });

  it('rejects photos that are too big, not images or not inline', async () => {
    const own = doc(as('student'), 'users/student');
    await assertFails(updateDoc(own, { photoURL: 'data:image/jpeg;base64,' + 'A'.repeat(100000) }));
    await assertFails(updateDoc(own, { photoURL: 'https://evil.example/tracker.png' }));
    await assertFails(updateDoc(own, { photoURL: 'data:text/html;base64,PHNjcmlwdD4=' }));
    await assertFails(updateDoc(own, { photoURL: 42 }));
    await assertFails(
      updateDoc(doc(as('admin'), 'users/student'), { photoURL: 'data:image/png;base64,AAAA' }),
    );
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

describe('personal details', () => {
  const profile = (extra: Record<string, unknown> = {}) => ({
    uid: 'new',
    email: 'a@b.co',
    displayName: 'Nuevo',
    role: 'student',
    createdAt: new Date(),
    ...extra,
  });

  it('accepts a birth date and an optional WhatsApp number at registration', async () => {
    await assertSucceeds(setDoc(doc(as('new'), 'users/new'), profile({ birthDate: '1995-04-30' })));
    await assertSucceeds(
      setDoc(
        doc(as('other'), 'users/other'),
        profile({ uid: 'other', birthDate: '1995-04-30', whatsapp: '+5215512345678' }),
      ),
    );
  });

  it('rejects badly formatted details', async () => {
    const own = doc(as('new'), 'users/new');
    await assertFails(setDoc(own, profile({ birthDate: '30/04/1995' })));
    await assertFails(setDoc(own, profile({ birthDate: new Date() })));
    await assertFails(setDoc(own, profile({ whatsapp: '5512345678' })));
    await assertFails(setDoc(own, profile({ whatsapp: '+52 55 1234 5678' })));
    await assertFails(setDoc(own, profile({ whatsapp: '+1234567' })));
  });

  it('lets owners add, change and remove their details later', async () => {
    const own = doc(as('student'), 'users/student');
    await assertSucceeds(updateDoc(own, { birthDate: '2001-12-01', whatsapp: '+56912345678' }));
    await assertSucceeds(updateDoc(own, { whatsapp: deleteField() }));
    await assertFails(updateDoc(own, { birthDate: 'mañana' }));
    await assertFails(updateDoc(doc(as('admin'), 'users/student'), { whatsapp: '+56912345678' }));
  });
});

describe('email verification', () => {
  it('keeps academy content closed until the email is verified', async () => {
    await assertFails(getDoc(doc(as('enrolled', false), 'materials/m1')));
    await assertFails(getDoc(doc(as('partial', false), 'courses/forex-101/lessons/l1')));
    await assertFails(getDoc(doc(as('admin', false), 'materials/m1')));
    await assertSucceeds(getDoc(doc(as('enrolled'), 'materials/m1')));
  });

  it('still lets an unverified user read and complete their own profile', async () => {
    const own = doc(as('student', false), 'users/student');
    await assertSucceeds(getDoc(own));
    await assertSucceeds(updateDoc(own, { birthDate: '1990-01-15' }));
  });
});

describe('device sessions', () => {
  const device = (extra: Record<string, unknown> = {}) => ({
    browser: 'Chrome',
    os: 'Windows',
    mobile: false,
    createdAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    revoked: false,
    ...extra,
  });
  const path = 'users/student/sessions/s1';
  const seed = () =>
    env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), path), {
        ...device(),
        createdAt: new Date(),
        lastSeen: new Date(),
      }),
    );

  it('lets each browser record itself under its owner only', async () => {
    await assertSucceeds(setDoc(doc(as('student'), path), device()));
    await assertFails(setDoc(doc(as('admin'), 'users/student/sessions/s2'), device()));
    await assertFails(
      setDoc(doc(as('student'), 'users/student/sessions/s3'), device({ revoked: true })),
    );
    await assertFails(
      setDoc(doc(as('student'), 'users/student/sessions/s4'), device({ createdAt: new Date(0) })),
    );
    await assertFails(
      setDoc(doc(as('student'), 'users/student/sessions/s5'), device({ ip: '1.2.3.4' })),
    );
    await assertFails(
      setDoc(doc(as('student'), 'users/student/sessions/s6'), device({ browser: 'x'.repeat(41) })),
    );
  });

  it('is private to its owner', async () => {
    await seed();
    await assertSucceeds(getDocs(collection(as('student'), 'users/student/sessions')));
    await assertFails(getDocs(collection(as('admin'), 'users/student/sessions')));
    await assertFails(getDoc(doc(as('enrolled'), path)));
    await assertFails(getDoc(doc(as(null), path)));
  });

  it('refreshes the last activity and signs a session out once', async () => {
    await seed();
    const own = doc(as('student'), path);
    await assertSucceeds(updateDoc(own, { lastSeen: serverTimestamp() }));
    await assertFails(updateDoc(own, { lastSeen: new Date(0) }));
    await assertFails(updateDoc(own, { browser: 'Firefox' }));
    await assertSucceeds(updateDoc(own, { revoked: true }));
    await assertFails(updateDoc(own, { revoked: false }));
    await assertFails(updateDoc(doc(as('enrolled'), path), { revoked: true }));
  });

  it('is deleted by its owner on sign-out, or by admins', async () => {
    await seed();
    await assertFails(deleteDoc(doc(as('enrolled'), path)));
    await assertSucceeds(deleteDoc(doc(as('student'), path)));
    await seed();
    await assertSucceeds(deleteDoc(doc(as('admin'), path)));
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
    evaluationId: null,
    ...extra,
  });
  const trade = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    side: 'long',
    orderType: 'market',
    orderPrice: null,
    placedTime: 1_620_000_000,
    quantity: 0.02,
    entryPrice: 50000.5,
    entryTime: 1_620_000_000,
    stopLoss: 49000,
    takeProfit: null,
    status: 'open',
    openedAt: serverTimestamp(),
    ...extra,
  });
  const limitOrder = (uid: string, extra: Record<string, unknown> = {}) =>
    trade(uid, {
      orderType: 'limit',
      orderPrice: 49500,
      entryPrice: 49500,
      status: 'pending',
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
      await setDoc(doc(db, 'practiceSessions/s1/trades/p1'), {
        ...limitOrder('enrolled'),
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

  it('accepts sessions on every practice timeframe', async () => {
    for (const interval of ['1m', '3m', '5m', '15m', '1h', '4h']) {
      await assertSucceeds(
        setDoc(sessionRef('enrolled', `tf-${interval}`), session('enrolled', { interval })),
      );
    }
  });

  it('keeps free sessions private to their owner and staff', async () => {
    await assertSucceeds(getDoc(sessionRef('enrolled')));
    await assertSucceeds(getDoc(sessionRef('admin')));
    await assertFails(getDoc(sessionRef('other')));
    await assertFails(getDoc(sessionRef('student')));
    await assertFails(getDoc(sessionRef('partial')));
    await assertFails(getDoc(sessionRef(null)));

    const sessions = (uid: string) => collection(as(uid), 'practiceSessions');
    await assertSucceeds(
      getDocs(
        query(sessions('enrolled'), where('uid', '==', 'enrolled'), orderBy('startedAt', 'desc')),
      ),
    );
    await assertFails(getDocs(sessions('enrolled')));
    await assertFails(getDocs(sessions('student')));
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
    await assertFails(
      setDoc(tradeRef('enrolled', 't4'), trade('enrolled', { orderType: 'iceberg' })),
    );
    await assertFails(
      setDoc(tradeRef('enrolled', 't4'), trade('enrolled', { orderPrice: 50000.5 })),
    );
  });

  it('places limit and stop orders as pending at their price', async () => {
    await assertSucceeds(setDoc(tradeRef('enrolled', 'p2'), limitOrder('enrolled')));
    await assertSucceeds(
      setDoc(
        tradeRef('enrolled', 'p3'),
        limitOrder('enrolled', { orderType: 'stop', stopLoss: null }),
      ),
    );
    await assertFails(
      setDoc(tradeRef('enrolled', 'p4'), limitOrder('enrolled', { status: 'open' })),
    );
    await assertFails(
      setDoc(tradeRef('enrolled', 'p4'), limitOrder('enrolled', { orderPrice: null })),
    );
    await assertFails(
      setDoc(tradeRef('enrolled', 'p4'), limitOrder('enrolled', { entryPrice: 1 })),
    );
    await assertFails(
      setDoc(tradeRef('enrolled', 'p4'), limitOrder('enrolled', { entryTime: 1_620_003_600 })),
    );
  });

  it('lets the owner move, fill or cancel a pending order, once', async () => {
    const order = tradeRef('enrolled', 'p1');
    await assertFails(updateDoc(tradeRef('other', 'p1'), { stopLoss: 49100 }));
    await assertSucceeds(
      updateDoc(order, {
        orderPrice: 49600,
        entryPrice: 49600,
        stopLoss: 49100,
        takeProfit: 52000,
      }),
    );
    await assertFails(updateDoc(order, { orderPrice: 49700 }));
    await assertFails(updateDoc(order, { quantity: 5 }));
    await assertFails(
      updateDoc(order, {
        status: 'closed',
        exitPrice: 1,
        exitTime: 1_620_003_600,
        exitReason: 'manual',
        pnl: 0,
        closedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(order, {
        status: 'open',
        entryPrice: 49600,
        entryTime: 1_620_000_000,
        filledAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(order, {
        status: 'open',
        entryPrice: 49550,
        entryTime: 1_620_003_600,
        filledAt: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(order, { status: 'cancelled', closedAt: serverTimestamp() }));

    await assertSucceeds(setDoc(tradeRef('enrolled', 'p2'), limitOrder('enrolled')));
    await assertSucceeds(
      updateDoc(tradeRef('enrolled', 'p2'), { status: 'cancelled', closedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(tradeRef('enrolled', 'p2'), { stopLoss: 49000 }));
  });

  it('shows trades to the session owner and admins only', async () => {
    await assertSucceeds(getDocs(collection(as('enrolled'), 'practiceSessions/s1/trades')));
    await assertSucceeds(getDocs(collection(as('admin'), 'practiceSessions/s1/trades')));
    await assertFails(getDocs(collection(as('other'), 'practiceSessions/s1/trades')));
    await assertFails(getDoc(tradeRef(null)));
  });

  it('moves stops of an open trade, closes it once and never edits its entry', async () => {
    await assertFails(updateDoc(tradeRef('other'), close()));
    await assertFails(updateDoc(tradeRef('enrolled'), { ...close(), entryPrice: 1 }));
    await assertFails(updateDoc(tradeRef('enrolled'), close({ exitReason: 'magic' })));
    await assertFails(updateDoc(tradeRef('enrolled'), close({ exitTime: 1 })));
    await assertFails(updateDoc(tradeRef('enrolled'), { stopLoss: 48000, entryPrice: 1 }));
    await assertFails(updateDoc(tradeRef('other'), { stopLoss: 48000 }));
    await assertSucceeds(updateDoc(tradeRef('enrolled'), { stopLoss: 48000, takeProfit: 55000 }));
    await assertFails(updateDoc(tradeRef('enrolled'), { stopLoss: -1 }));
    await assertSucceeds(updateDoc(tradeRef('enrolled'), close({ exitReason: 'stopLoss' })));
    await assertFails(updateDoc(tradeRef('enrolled'), close({ pnl: 5000 })));
    await assertFails(updateDoc(tradeRef('enrolled'), { stopLoss: 47000 }));
  });

  it('closes a trade on a margin stop out', async () => {
    await assertSucceeds(setDoc(tradeRef('enrolled', 't2'), trade('enrolled')));
    await assertSucceeds(updateDoc(tradeRef('enrolled', 't2'), close({ exitReason: 'stopOut' })));
  });
});

describe('trainers', () => {
  it('can be appointed by admins only', async () => {
    await assertSucceeds(updateDoc(doc(as('admin'), 'users/student'), { role: 'trainer' }));
    await assertFails(updateDoc(doc(as('trainer'), 'users/enrolled'), { role: 'trainer' }));
    await assertFails(updateDoc(doc(as('trainer'), 'users/trainer'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('student'), 'users/student'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('enrolled'), 'users/student'), { role: 'trainer' }));
  });

  it('read users and enrollments but cannot change access', async () => {
    await assertSucceeds(getDocs(collection(as('trainer'), 'users')));
    await assertSucceeds(getDocs(collection(as('trainer'), 'enrollments')));
    await assertFails(
      setDoc(doc(as('trainer'), 'enrollments/student'), {
        academy: true,
        courses: [],
        updatedBy: 'trainer',
      }),
    );
    await assertFails(deleteDoc(doc(as('trainer'), 'users/student')));
    await assertFails(setDoc(doc(as('trainer'), 'materials/m2'), { title: 'x' }));
  });

  it('have academy access', async () => {
    await assertSucceeds(getDoc(doc(as('trainer'), 'materials/m1')));
  });
});

describe('evaluations', () => {
  const hour = 60 * 60 * 1000;
  const evaluation = (extra: Record<string, unknown> = {}) => ({
    title: 'Evaluación oro',
    description: '',
    symbol: 'PAXGUSDT',
    replayStart: 1_620_000_000_000,
    hideDates: true,
    startingBalance: 200,
    durationMinutes: 30,
    opensAt: new Date(Date.now() - hour),
    closesAt: new Date(Date.now() + hour),
    studentIds: ['enrolled'],
    resultsPublished: false,
    createdBy: 'trainer',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  });
  const attempt = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    userName: 'Ana',
    symbol: 'PAXGUSDT',
    interval: '15m',
    replayStart: 1_620_000_000_000,
    startingBalance: 200,
    balance: 200,
    pnl: 0,
    tradeCount: 0,
    status: 'active',
    startedAt: serverTimestamp(),
    evaluationId: 'e1',
    durationMinutes: 30,
    ...extra,
  });
  const trade = {
    uid: 'enrolled',
    side: 'long',
    orderType: 'market',
    orderPrice: null,
    placedTime: 1_620_000_000,
    quantity: 1,
    entryPrice: 1800,
    entryTime: 1_620_000_000,
    stopLoss: null,
    takeProfit: null,
    status: 'open',
    openedAt: serverTimestamp(),
  };
  const evalRef = (uid: string | null, id = 'e1') => doc(as(uid), `evaluations/${id}`);
  const attemptRef = (uid: string | null, id = 'e1_enrolled') =>
    doc(as(uid), `practiceSessions/${id}`);
  const seed = (path: string, data: Record<string, unknown>) =>
    env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));
  const seeded = (data: Record<string, unknown>) => ({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    await seed('enrollments/other', { academy: true, courses: [] });
    await seed('evaluations/e1', seeded(evaluation()));
  });

  it('are set up by trainers and admins only', async () => {
    await assertSucceeds(setDoc(evalRef('trainer', 'e2'), evaluation()));
    await assertSucceeds(setDoc(evalRef('admin', 'e3'), evaluation({ createdBy: 'admin' })));
    await assertFails(setDoc(evalRef('enrolled', 'e4'), evaluation({ createdBy: 'enrolled' })));
    await assertFails(setDoc(evalRef(null, 'e4'), evaluation()));
    await assertFails(setDoc(evalRef('trainer', 'e4'), evaluation({ createdBy: 'admin' })));
    await assertSucceeds(deleteDoc(evalRef('trainer', 'e2')));
    await assertFails(deleteDoc(evalRef('enrolled')));
  });

  it('validates an evaluation', async () => {
    const create = (extra: Record<string, unknown>) =>
      setDoc(evalRef('trainer', 'e5'), evaluation(extra));
    await assertFails(create({ title: '' }));
    await assertFails(create({ durationMinutes: 2 }));
    await assertFails(create({ durationMinutes: 30.5 }));
    await assertFails(create({ closesAt: new Date(Date.now() - 2 * hour) }));
    await assertFails(create({ studentIds: 'enrolled' }));
    await assertFails(create({ grade: 'A' }));
  });

  it('keep their author when edited', async () => {
    await assertSucceeds(
      updateDoc(evalRef('admin'), { title: 'Nuevo', updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(evalRef('admin'), { createdBy: 'admin', updatedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(evalRef('enrolled'), { title: 'x', updatedAt: serverTimestamp() }));
  });

  it('are visible to their students and staff', async () => {
    await assertSucceeds(getDoc(evalRef('enrolled')));
    await assertSucceeds(getDoc(evalRef('trainer')));
    await assertFails(getDoc(evalRef('other')));
    await assertSucceeds(
      getDocs(
        query(
          collection(as('enrolled'), 'evaluations'),
          where('studentIds', 'array-contains', 'enrolled'),
        ),
      ),
    );
    await assertFails(getDocs(collection(as('enrolled'), 'evaluations')));
    await assertSucceeds(getDocs(collection(as('trainer'), 'evaluations')));
  });

  it('take one attempt per assigned student, inside the window', async () => {
    await assertFails(setDoc(attemptRef('enrolled', 'other-id'), attempt('enrolled')));
    await assertFails(setDoc(attemptRef('other', 'e1_other'), attempt('other')));
    await assertFails(setDoc(attemptRef('enrolled'), attempt('enrolled', { symbol: 'BTCUSDT' })));
    await assertFails(setDoc(attemptRef('enrolled'), attempt('enrolled', { replayStart: 1 })));
    await assertFails(
      setDoc(attemptRef('enrolled'), attempt('enrolled', { durationMinutes: 600 })),
    );
    await assertFails(
      setDoc(attemptRef('enrolled'), attempt('enrolled', { startingBalance: 100000 })),
    );
    await assertFails(
      setDoc(attemptRef('enrolled', 'e9_enrolled'), attempt('enrolled', { evaluationId: 'e9' })),
    );
    await assertSucceeds(setDoc(attemptRef('enrolled'), attempt('enrolled')));
    // Starting again would overwrite the first attempt.
    await assertFails(setDoc(attemptRef('enrolled'), attempt('enrolled')));
  });

  it('cannot be started outside the window', async () => {
    await seed(
      'evaluations/later',
      seeded(
        evaluation({
          opensAt: new Date(Date.now() + hour),
          closesAt: new Date(Date.now() + 2 * hour),
        }),
      ),
    );
    await seed(
      'evaluations/past',
      seeded(
        evaluation({
          opensAt: new Date(Date.now() - 2 * hour),
          closesAt: new Date(Date.now() - hour),
        }),
      ),
    );
    await assertFails(
      setDoc(
        attemptRef('enrolled', 'later_enrolled'),
        attempt('enrolled', { evaluationId: 'later' }),
      ),
    );
    await assertFails(
      setDoc(
        attemptRef('enrolled', 'past_enrolled'),
        attempt('enrolled', { evaluationId: 'past' }),
      ),
    );
  });

  it('keeps free sessions free of a time limit', async () => {
    const free = attempt('enrolled', { evaluationId: null, durationMinutes: 30 });
    await assertFails(setDoc(attemptRef('enrolled', 'free'), free));
  });

  it('stop taking orders when the time is up', async () => {
    await seed('practiceSessions/e1_enrolled', {
      ...attempt('enrolled'),
      startedAt: new Date(Date.now() - 31 * 60 * 1000),
    });
    await seed('practiceSessions/e1_enrolled/trades/t1', { ...trade, openedAt: new Date() });
    const tradeRef = (id: string) =>
      doc(as('enrolled'), `practiceSessions/e1_enrolled/trades/${id}`);
    await assertFails(setDoc(tradeRef('t2'), trade));
    // Two more minutes to close what is open and finish.
    await assertSucceeds(
      updateDoc(tradeRef('t1'), {
        status: 'closed',
        exitPrice: 1810,
        exitTime: 1_620_001_800,
        exitReason: 'sessionEnd',
        pnl: 10,
        closedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(attemptRef('enrolled'), {
        balance: 210,
        pnl: 10,
        tradeCount: 1,
        status: 'finished',
        endedAt: serverTimestamp(),
      }),
    );
  });

  it('lock an attempt after its grace period', async () => {
    await seed('practiceSessions/e1_enrolled', {
      ...attempt('enrolled'),
      startedAt: new Date(Date.now() - 33 * 60 * 1000),
    });
    await assertFails(updateDoc(attemptRef('enrolled'), { pnl: 500, balance: 700 }));
  });

  it('take orders while the time runs', async () => {
    await assertSucceeds(setDoc(attemptRef('enrolled'), attempt('enrolled')));
    await assertSucceeds(
      setDoc(doc(as('enrolled'), 'practiceSessions/e1_enrolled/trades/t1'), trade),
    );
  });

  it('let trainers review sessions and trades, but only admins delete them', async () => {
    await seed('practiceSessions/e1_enrolled', { ...attempt('enrolled'), startedAt: new Date() });
    await seed('practiceSessions/e1_enrolled/trades/t1', { ...trade, openedAt: new Date() });
    await assertSucceeds(getDocs(collection(as('trainer'), 'practiceSessions')));
    await assertSucceeds(getDocs(collection(as('trainer'), 'practiceSessions/e1_enrolled/trades')));
    await assertFails(deleteDoc(attemptRef('trainer')));
    await assertFails(deleteDoc(doc(as('trainer'), 'practiceSessions/e1_enrolled/trades/t1')));
  });
});

describe('ranking', () => {
  const finished = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    userName: uid,
    symbol: 'PAXGUSDT',
    interval: '15m',
    replayStart: 1_620_000_000_000,
    startingBalance: 200,
    balance: 220,
    pnl: 20,
    tradeCount: 3,
    status: 'finished',
    startedAt: new Date(),
    endedAt: new Date(),
    evaluationId: null,
    ...extra,
  });
  const seed = (path: string, data: Record<string, unknown>) =>
    env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));
  const sessions = (uid: string | null) => collection(as(uid), 'practiceSessions');
  const evaluation = (resultsPublished: boolean) => ({
    title: 'Evaluación',
    studentIds: ['enrolled', 'other'],
    resultsPublished,
  });

  beforeEach(async () => {
    await seed('enrollments/other', { academy: true, courses: [] });
    await seed('practiceSessions/f1', finished('enrolled'));
    await seed('practiceSessions/e1_enrolled', finished('enrolled', { evaluationId: 'e1' }));
    await seed('practiceSessions/e2_enrolled', finished('enrolled', { evaluationId: 'e2' }));
    await seed('evaluations/e1', evaluation(true));
    await seed('evaluations/e2', evaluation(false));
  });

  it('never lists free sessions to other students', async () => {
    const free = (uid: string | null) =>
      getDocs(
        query(
          sessions(uid),
          where('evaluationId', '==', null),
          where('status', '==', 'finished'),
          where('endedAt', '>=', new Date(0)),
          orderBy('endedAt', 'desc'),
        ),
      );
    await assertFails(free('other'));
    await assertSucceeds(free('trainer'));
    await assertFails(free('student'));
    await assertFails(free(null));
    await assertFails(getDoc(doc(as('other'), 'practiceSessions/f1')));
  });

  it('shows evaluation results to others once published', async () => {
    const results = (uid: string, id: string) =>
      getDocs(query(sessions(uid), where('evaluationId', '==', id)));
    await assertSucceeds(getDoc(doc(as('other'), 'practiceSessions/e1_enrolled')));
    await assertFails(getDoc(doc(as('other'), 'practiceSessions/e2_enrolled')));
    await assertSucceeds(results('other', 'e1'));
    await assertFails(results('other', 'e2'));
    await assertFails(results('student', 'e1'));
    await assertSucceeds(results('trainer', 'e2'));
    // Trades stay private either way.
    await assertFails(getDocs(collection(as('other'), 'practiceSessions/e1_enrolled/trades')));
  });
});

describe('evaluation forms', () => {
  const hour = 60 * 60 * 1000;
  const exam = (extra: Record<string, unknown> = {}) => ({
    title: 'Fundamentos de trading',
    description: '',
    totalPoints: 100,
    passingPoints: 70,
    durationMinutes: 30,
    maxAttempts: 2,
    audience: 'selected',
    studentIds: ['enrolled'],
    opensAt: new Date(Date.now() - hour),
    closesAt: new Date(Date.now() + hour),
    questions: [
      {
        id: 'q1',
        type: 'single',
        text: '¿RSI?',
        imageUrl: '',
        options: ['a', 'b'],
        points: 100,
        partial: false,
      },
    ],
    published: true,
    resultsPublished: false,
    showAnswers: false,
    createdBy: 'trainer',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  });
  const submission = (uid: string, attempt = 1, extra: Record<string, unknown> = {}) => ({
    examId: 'x1',
    uid,
    userName: 'Ana',
    attempt,
    status: 'inProgress',
    answers: {},
    startedAt: serverTimestamp(),
    submittedAt: null,
    ...extra,
  });
  const grade = (extra: Record<string, unknown> = {}) => ({
    examId: 'x1',
    uid: 'enrolled',
    attempt: 1,
    scores: { q1: 100 },
    comments: {},
    feedback: 'Bien',
    total: 100,
    passed: true,
    gradedBy: 'trainer',
    gradedAt: serverTimestamp(),
    ...extra,
  });
  const examRef = (uid: string | null, id = 'x1') => doc(as(uid), `examForms/${id}`);
  const subRef = (uid: string | null, id = 'x1_enrolled_1') =>
    doc(as(uid), `examSubmissions/${id}`);
  const gradeRef = (uid: string | null, id = 'x1_enrolled_1') => doc(as(uid), `examGrades/${id}`);
  const keyRef = (uid: string | null, id = 'x1') => doc(as(uid), `examKeys/${id}`);
  const seed = (path: string, data: Record<string, unknown>) =>
    env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));
  const seededExam = (extra: Record<string, unknown> = {}) =>
    seed('examForms/x1', { ...exam(extra), createdAt: new Date(), updatedAt: new Date() });

  beforeEach(async () => {
    await seed('enrollments/other', { academy: true, courses: [] });
    await seededExam();
    await seed('examKeys/x1', { answers: { q1: [0] }, updatedAt: new Date() });
  });

  it('are built by trainers and admins only', async () => {
    await assertSucceeds(setDoc(examRef('trainer', 'x2'), exam()));
    await assertSucceeds(setDoc(examRef('admin', 'x3'), exam({ createdBy: 'admin' })));
    await assertFails(setDoc(examRef('enrolled', 'x4'), exam({ createdBy: 'enrolled' })));
    await assertFails(setDoc(examRef(null, 'x4'), exam()));
    await assertFails(setDoc(examRef('trainer', 'x4'), exam({ createdBy: 'admin' })));
    await assertSucceeds(
      updateDoc(examRef('admin'), { title: 'Nuevo', updatedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(examRef('enrolled'), { title: 'x', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(examRef('enrolled')));
    await assertSucceeds(deleteDoc(examRef('trainer')));
  });

  it('validates a form', async () => {
    const create = (extra: Record<string, unknown>) =>
      setDoc(examRef('trainer', 'x5'), exam(extra));
    await assertFails(create({ title: '' }));
    await assertFails(create({ totalPoints: 0 }));
    await assertFails(create({ passingPoints: 120 }));
    await assertFails(create({ maxAttempts: 4 }));
    await assertFails(create({ durationMinutes: 601 }));
    await assertFails(create({ audience: 'group' }));
    await assertFails(create({ closesAt: new Date(Date.now() - 2 * hour) }));
    await assertFails(create({ answers: { q1: [0] } }));
  });

  it('show published forms to their students only, never the answer key', async () => {
    await assertSucceeds(getDoc(examRef('enrolled')));
    await assertFails(getDoc(examRef('other')));
    await assertSucceeds(
      getDocs(
        query(
          collection(as('enrolled'), 'examForms'),
          where('published', '==', true),
          where('studentIds', 'array-contains', 'enrolled'),
        ),
      ),
    );
    await assertFails(getDoc(keyRef('enrolled')));
    await assertSucceeds(getDoc(keyRef('trainer')));
    await assertFails(setDoc(keyRef('enrolled'), { answers: {}, updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(keyRef('trainer'), { answers: {}, updatedAt: serverTimestamp() }));

    // Forms for everyone: any student with academy access, not one without it.
    await seededExam({ audience: 'all', studentIds: [] });
    await assertSucceeds(getDoc(examRef('other')));
    await assertSucceeds(
      getDocs(
        query(
          collection(as('other'), 'examForms'),
          where('published', '==', true),
          where('audience', '==', 'all'),
        ),
      ),
    );
    await assertFails(getDoc(examRef('student')));

    // Drafts stay with the staff.
    await seededExam({ audience: 'all', published: false });
    await assertFails(getDoc(examRef('enrolled')));
  });

  it('share the right answers once results are published with them', async () => {
    await seededExam({ resultsPublished: true });
    await assertFails(getDoc(keyRef('enrolled')));
    await seededExam({ resultsPublished: true, showAnswers: true });
    await assertSucceeds(getDoc(keyRef('enrolled')));
    await assertFails(getDoc(keyRef('other')));
  });

  it('take attempts from assigned students inside the window', async () => {
    await assertSucceeds(setDoc(subRef('enrolled'), submission('enrolled')));
    await assertFails(setDoc(subRef('other', 'x1_other_1'), submission('other')));
    await assertFails(setDoc(subRef('enrolled', 'x1_other_1'), submission('enrolled')));
    await assertFails(setDoc(subRef('enrolled', 'x1_enrolled_3'), submission('enrolled', 3)));
    await assertFails(
      setDoc(subRef('enrolled', 'x1_enrolled_2'), submission('enrolled', 2, { examId: 'x1' })),
    );
    await assertFails(
      setDoc(
        subRef('enrolled', 'x1_enrolled_1'),
        submission('enrolled', 1, { status: 'submitted' }),
      ),
    );

    await seededExam({
      opensAt: new Date(Date.now() + hour),
      closesAt: new Date(Date.now() + 2 * hour),
    });
    await assertFails(setDoc(subRef('enrolled'), submission('enrolled')));
  });

  it('let the student save and hand in an attempt once, then open the next', async () => {
    await assertSucceeds(setDoc(subRef('enrolled'), submission('enrolled')));
    const answers = { q1: { choices: [0], text: '' } };
    await assertSucceeds(updateDoc(subRef('enrolled'), { answers }));
    await assertFails(updateDoc(subRef('other'), { answers }));
    await assertFails(updateDoc(subRef('enrolled'), { attempt: 2 }));
    // The second attempt waits for the first.
    await assertFails(setDoc(subRef('enrolled', 'x1_enrolled_2'), submission('enrolled', 2)));
    await assertSucceeds(
      updateDoc(subRef('enrolled'), { status: 'submitted', submittedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(subRef('enrolled'), { answers: {} }));
    await assertSucceeds(setDoc(subRef('enrolled', 'x1_enrolled_2'), submission('enrolled', 2)));
    await assertSucceeds(getDoc(subRef('enrolled')));
    await assertSucceeds(getDoc(subRef('trainer')));
    await assertFails(getDoc(subRef('other')));
    await assertFails(deleteDoc(subRef('enrolled')));
  });

  it('stop taking answers after the time limit', async () => {
    await seed('examSubmissions/x1_enrolled_1', {
      ...submission('enrolled'),
      startedAt: new Date(Date.now() - 40 * 60 * 1000),
    });
    await assertFails(updateDoc(subRef('enrolled'), { answers: {} }));
    // Its time is up, so the next attempt can start.
    await assertSucceeds(setDoc(subRef('enrolled', 'x1_enrolled_2'), submission('enrolled', 2)));
  });

  it('are graded by staff, and students see grades once published', async () => {
    await seed('examSubmissions/x1_enrolled_1', {
      ...submission('enrolled', 1, { status: 'submitted' }),
      startedAt: new Date(),
      submittedAt: new Date(),
    });
    await assertSucceeds(setDoc(gradeRef('trainer'), grade()));
    await assertFails(setDoc(gradeRef('enrolled'), grade({ gradedBy: 'enrolled' })));
    await assertFails(setDoc(gradeRef('admin'), grade()));
    await assertFails(setDoc(gradeRef('trainer', 'x1_enrolled_2'), grade({ attempt: 2 })));
    await assertFails(setDoc(gradeRef('trainer'), grade({ total: -1 })));
    await assertFails(getDoc(gradeRef('enrolled')));
    await assertSucceeds(getDoc(gradeRef('trainer')));
    await seededExam({ resultsPublished: true });
    await assertSucceeds(getDoc(gradeRef('enrolled')));
    await assertFails(getDoc(gradeRef('other')));
  });
});

describe('unknown collections', () => {
  it('are closed to everyone, admins included', async () => {
    await assertFails(getDoc(doc(as('admin'), 'secrets/s1')));
    await assertFails(setDoc(doc(as('admin'), 'secrets/s1'), { x: 1 }));
    await assertFails(setDoc(doc(as(null), 'logs/l1'), { x: 1 }));
  });
});
