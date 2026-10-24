import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FIREBASE_AUTH, FIRESTORE } from '../firebase/firebase.providers';
import { AuthService } from './auth.service';

type Listener = { next: (snapshot: unknown) => void; error: (e: unknown) => void };

// Fake Firebase SDK: captures the auth-state callback and Firestore listeners so each test
// can drive them by hand.
const fb = vi.hoisted(() => ({
  authCallback: null as ((user: unknown) => void) | null,
  listeners: new Map<string, Listener>(),
  unsubscribes: [] as ReturnType<typeof vi.fn>[],
  existing: new Set<string>(),
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: vi.fn((_auth, callback) => (fb.authCallback = callback)),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection: string, id: string) => ({ path: `${collection}/${id}` })),
  getDoc: vi.fn(async (ref: { path: string }) => ({ exists: () => fb.existing.has(ref.path) })),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  onSnapshot: vi.fn((ref: { path: string }, next, error) => {
    fb.listeners.set(ref.path, { next, error });
    const unsubscribe = vi.fn();
    fb.unsubscribes.push(unsubscribe);
    return unsubscribe;
  }),
}));

import * as auth from 'firebase/auth';
import * as firestore from 'firebase/firestore';

const user = (uid: string, extra: Record<string, unknown> = {}) =>
  ({ uid, email: `${uid}@indab.co`, displayName: null, ...extra }) as unknown as auth.User;

const snapshot = (data: unknown) => ({ exists: () => data !== undefined, data: () => data });

/** Lets pending promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    fb.authCallback = null;
    fb.listeners.clear();
    fb.unsubscribes = [];
    fb.existing.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: FIREBASE_AUTH, useValue: {} },
        { provide: FIRESTORE, useValue: {} },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  /** Emits an auth state, then answers the profile and enrollment listeners. */
  const signInAs = (uid: string, profile?: unknown, enrollment?: unknown) => {
    fb.authCallback!(user(uid));
    fb.listeners.get(`users/${uid}`)!.next(snapshot(profile));
    fb.listeners.get(`enrollments/${uid}`)!.next(snapshot(enrollment));
    return service.whenReady();
  };

  it('stays pending until Firebase restores the session', async () => {
    let ready = false;
    service.whenReady().then(() => (ready = true));
    await flush();
    expect(ready).toBe(false);

    fb.authCallback!(null);
    await flush();
    expect(ready).toBe(true);
    expect(service.isLoggedIn()).toBe(false);
    expect(service.isAdmin()).toBe(false);
    expect(service.hasAcademyAccess()).toBe(false);
  });

  it('waits for the profile and enrollment before it is ready', async () => {
    let ready = false;
    service.whenReady().then(() => (ready = true));
    fb.authCallback!(user('ana'));
    fb.listeners.get('users/ana')!.next(snapshot({ role: 'student' }));
    await flush();
    expect(ready).toBe(false);

    fb.listeners.get('enrollments/ana')!.next(snapshot(undefined));
    await flush();
    expect(ready).toBe(true);
    expect(service.isLoggedIn()).toBe(true);
    expect(service.profile()?.role).toBe('student');
    expect(service.enrollment()).toBeNull();
  });

  it('derives academy access from the enrollment or the admin role', async () => {
    await signInAs('ana', { role: 'student' }, { academy: false, courses: [] });
    expect(service.hasAcademyAccess()).toBe(false);

    fb.listeners.get('enrollments/ana')!.next(snapshot({ academy: true, courses: [] }));
    expect(service.hasAcademyAccess()).toBe(true);
    expect(service.isAdmin()).toBe(false);

    fb.listeners.get('enrollments/ana')!.next(snapshot(undefined));
    fb.listeners.get('users/ana')!.next(snapshot({ role: 'admin' }));
    expect(service.isAdmin()).toBe(true);
    expect(service.hasAcademyAccess()).toBe(true);
  });

  it('treats a denied or failed listener as missing data', async () => {
    fb.authCallback!(user('ana'));
    fb.listeners.get('users/ana')!.error(new Error('permission-denied'));
    fb.listeners.get('enrollments/ana')!.error(new Error('permission-denied'));
    await service.whenReady();
    expect(service.isLoggedIn()).toBe(true);
    expect(service.profile()).toBeNull();
    expect(service.enrollment()).toBeNull();
  });

  it('clears user data and stops listeners on sign-out', async () => {
    await signInAs('ana', { role: 'admin' }, { academy: true, courses: [] });
    expect(fb.unsubscribes).toHaveLength(2);

    fb.authCallback!(null);
    await service.whenReady();
    fb.unsubscribes.forEach((unsubscribe) => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(service.user()).toBeNull();
    expect(service.profile()).toBeNull();
    expect(service.enrollment()).toBeNull();
    expect(service.isAdmin()).toBe(false);
  });

  it('switches listeners when another user signs in', async () => {
    await signInAs('ana', { role: 'admin' });
    await signInAs('luis', { role: 'student' });
    expect(fb.unsubscribes[0]).toHaveBeenCalled();
    expect(fb.unsubscribes[1]).toHaveBeenCalled();
    expect(service.user()?.uid).toBe('luis');
    expect(service.isAdmin()).toBe(false);
  });

  it('registers with email and creates a student profile', async () => {
    vi.mocked(auth.createUserWithEmailAndPassword).mockResolvedValue({
      user: user('new'),
    } as auth.UserCredential);

    await service.registerWithEmail('Nuevo Alumno', 'new@indab.co', 'secret1');

    expect(auth.createUserWithEmailAndPassword).toHaveBeenCalledWith({}, 'new@indab.co', 'secret1');
    expect(auth.updateProfile).toHaveBeenCalledWith(user('new'), { displayName: 'Nuevo Alumno' });
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: 'users/new' },
      {
        uid: 'new',
        email: 'new@indab.co',
        displayName: 'Nuevo Alumno',
        role: 'student',
        createdAt: 'SERVER_TIMESTAMP',
      },
    );
  });

  it('creates a profile on the first Google sign-in only', async () => {
    vi.mocked(auth.signInWithPopup).mockResolvedValue({
      user: user('g1', { displayName: 'Gabriela' }),
    } as auth.UserCredential);

    await service.signInWithGoogle();
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: 'users/g1' },
      expect.objectContaining({ displayName: 'Gabriela', role: 'student' }),
    );

    vi.mocked(firestore.setDoc).mockClear();
    fb.existing.add('users/g1');
    await service.signInWithGoogle();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('passes sign-in, password reset and sign-out through to Firebase', async () => {
    await service.signInWithEmail('a@indab.co', 'pw');
    expect(auth.signInWithEmailAndPassword).toHaveBeenCalledWith({}, 'a@indab.co', 'pw');
    await service.sendPasswordReset('a@indab.co');
    expect(auth.sendPasswordResetEmail).toHaveBeenCalledWith({}, 'a@indab.co');
    await service.signOut();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('republishes the current user after it changed in place', async () => {
    const current = user('u1', { displayName: 'Ana' });
    await signInAs('u1');
    const seen: unknown[] = [];
    const watcher = TestBed.runInInjectionContext(() => effect(() => seen.push(service.user())));
    TestBed.tick();
    Object.assign(TestBed.inject(FIREBASE_AUTH), { currentUser: current });
    service.refreshUser();
    TestBed.tick();
    expect(seen.at(-1)).toBe(current);
    expect(seen.length).toBe(2);
    watcher.destroy();
  });

  it('propagates sign-in errors to the caller', async () => {
    vi.mocked(auth.signInWithEmailAndPassword).mockRejectedValue(
      new Error('auth/invalid-credential'),
    );
    await expect(service.signInWithEmail('a@indab.co', 'bad')).rejects.toThrow(
      'invalid-credential',
    );
  });
});
