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

describe('learning material', () => {
  it('is readable only by enrolled users and admins', async () => {
    await assertFails(getDoc(doc(as(null), 'materials/m1')));
    await assertFails(getDoc(doc(as('student'), 'materials/m1')));
    await assertFails(getDoc(doc(as('partial'), 'materials/m1')));
    await assertSucceeds(getDoc(doc(as('enrolled'), 'materials/m1')));
    await assertSucceeds(getDoc(doc(as('admin'), 'materials/m1')));
    await assertFails(setDoc(doc(as('enrolled'), 'materials/m2'), { title: 'x' }));
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
});

describe('investors', () => {
  it('lets investors read only their own account', async () => {
    await assertSucceeds(getDoc(doc(as('investor'), 'investors/investor')));
    await assertFails(getDoc(doc(as('student'), 'investors/investor')));
    await assertFails(setDoc(doc(as('investor'), 'investors/investor'), { balance: 1e9 }));
  });
});
