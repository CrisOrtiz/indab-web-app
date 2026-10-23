import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
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

describe('unknown collections', () => {
  it('are closed to everyone, admins included', async () => {
    await assertFails(getDoc(doc(as('admin'), 'secrets/s1')));
    await assertFails(setDoc(doc(as('admin'), 'secrets/s1'), { x: 1 }));
    await assertFails(setDoc(doc(as(null), 'logs/l1'), { x: 1 }));
  });
});
