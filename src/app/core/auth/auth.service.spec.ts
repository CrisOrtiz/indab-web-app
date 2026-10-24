import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FIREBASE_AUTH, FIRESTORE_LOADER } from '../firebase/firebase.providers';
import { AuthService } from './auth.service';

type Listener = { next: (snapshot: unknown) => void; error: (e: unknown) => void };

// Fake Firebase SDK: captures the auth-state callback and Firestore listeners so each test
// can drive them by hand.
const fb = vi.hoisted(() => ({
  authCallback: null as ((user: unknown) => void) | null,
  listeners: new Map<string, Listener>(),
  unsubscribes: [] as ReturnType<typeof vi.fn>[],
  existing: new Set<string>(),
  /** The browser's own entry in users/{uid}/sessions (see session-tracker.spec.ts). */
  sessionListener: null as ((snapshot: unknown) => void) | null,
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: vi.fn((_auth, callback) => (fb.authCallback = callback)),
  createUserWithEmailAndPassword: vi.fn(),
  reload: vi.fn(async () => undefined),
  sendEmailVerification: vi.fn(async () => undefined),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  // doc(db, collection, id), or doc(collectionRef[, id]) with an automatic id `browser-1`.
  doc: vi.fn((parent: { path?: string }, ...segments: string[]) => {
    if (!parent.path) {
      return { path: segments.join('/') };
    }
    const id = segments[0] ?? 'browser-1';
    return { path: `${parent.path}/${id}`, id };
  }),
  getDoc: vi.fn(async (ref: { path: string }) => ({ exists: () => fb.existing.has(ref.path) })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  onSnapshot: vi.fn((ref: { path: string }, next, error) => {
    if (ref.path.includes('/sessions/')) {
      fb.sessionListener = next;
      return () => undefined;
    }
    fb.listeners.set(ref.path, { next, error });
    const unsubscribe = vi.fn();
    fb.unsubscribes.push(unsubscribe);
    return unsubscribe;
  }),
}));

import { Router } from '@angular/router';
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
    fb.sessionListener = null;
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: FIREBASE_AUTH, useValue: {} },
        { provide: FIRESTORE_LOADER, useValue: { load: async () => ({}), instance: () => ({}) } },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  /** Emits an auth state and lets the lazily loaded Firestore code attach its listeners. */
  const emit = async (value: auth.User) => {
    fb.authCallback!(value);
    await vi.waitFor(() => expect(fb.listeners.has(`enrollments/${value.uid}`)).toBe(true));
  };

  /** Emits an auth state, then answers the profile and enrollment listeners. */
  const signInAs = async (uid: string, profile?: unknown, enrollment?: unknown) => {
    await emit(user(uid));
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
    await emit(user('ana'));
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
    await emit(user('ana'));
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

  it('drops the data load of a user who signed out before Firestore loaded', async () => {
    fb.authCallback!(user('ana'));
    fb.authCallback!(null);
    await service.whenReady();
    await vi.dynamicImportSettled();
    await flush();
    expect(fb.listeners.size).toBe(0);
    expect(service.isLoggedIn()).toBe(false);
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

    Object.assign(TestBed.inject(FIREBASE_AUTH), { currentUser: user('new') });

    await service.registerWithEmail('Nuevo Alumno', 'new@indab.co', 'secret1', {
      birthDate: '1998-03-21',
      whatsapp: '+5215512345678',
    });

    expect(auth.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      TestBed.inject(FIREBASE_AUTH),
      'new@indab.co',
      'secret1',
    );
    expect(auth.updateProfile).toHaveBeenCalledWith(user('new'), { displayName: 'Nuevo Alumno' });
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: 'users/new' },
      {
        uid: 'new',
        email: 'new@indab.co',
        displayName: 'Nuevo Alumno',
        role: 'student',
        createdAt: 'SERVER_TIMESTAMP',
        birthDate: '1998-03-21',
        whatsapp: '+5215512345678',
      },
    );
    expect(auth.sendEmailVerification).toHaveBeenCalledWith(user('new'), {
      url: `${location.origin}/account-setup`,
    });
  });

  it('leaves out an empty WhatsApp number and survives a failed verification email', async () => {
    vi.mocked(auth.createUserWithEmailAndPassword).mockResolvedValue({
      user: user('new'),
    } as auth.UserCredential);
    vi.mocked(auth.sendEmailVerification).mockRejectedValueOnce(new Error('network'));
    Object.assign(TestBed.inject(FIREBASE_AUTH), { currentUser: user('new') });

    await service.registerWithEmail('Nuevo', 'new@indab.co', 'secret1', {
      birthDate: '1998-03-21',
      whatsapp: '',
    });
    expect(vi.mocked(firestore.setDoc).mock.calls[0][1]).not.toHaveProperty('whatsapp');
  });

  it('asks unverified users to confirm their email, then for missing details', async () => {
    expect(service.setupStep()).toBeNull();
    const unverified = user('ana', { emailVerified: false });
    fb.authCallback!(unverified);
    await vi.waitFor(() => expect(fb.listeners.has('enrollments/ana')).toBe(true));
    fb.listeners.get('users/ana')!.next(snapshot({ role: 'student' }));
    expect(service.setupStep()).toBe('verifyEmail');

    // Opening the link elsewhere only shows here once the user is reloaded.
    vi.mocked(auth.reload).mockImplementationOnce(async (u) => {
      Object.assign(u, { emailVerified: true });
    });
    const getIdToken = vi.fn(async () => 'token');
    Object.assign(unverified, { getIdToken });
    Object.assign(TestBed.inject(FIREBASE_AUTH), { currentUser: unverified });
    expect(await service.checkEmailVerified()).toBe(true);
    expect(getIdToken).toHaveBeenCalledWith(true);
    expect(service.setupStep()).toBe('details');

    fb.listeners.get('users/ana')!.next(snapshot({ role: 'student', birthDate: '1990-01-01' }));
    expect(service.setupStep()).toBeNull();
  });

  it('does not ask for details while the profile is missing', async () => {
    fb.authCallback!(user('ana', { emailVerified: true }));
    await vi.waitFor(() => expect(fb.listeners.has('users/ana')).toBe(true));
    fb.listeners.get('users/ana')!.next(snapshot(undefined));
    expect(service.setupStep()).toBeNull();
  });

  it('keeps the email step while the link is not opened', async () => {
    const unverified = user('ana', { emailVerified: false, getIdToken: vi.fn() });
    Object.assign(TestBed.inject(FIREBASE_AUTH), { currentUser: unverified });
    expect(await service.checkEmailVerified()).toBe(false);
    expect(unverified.getIdToken).not.toHaveBeenCalled();
  });

  it("records this browser's session and removes it on sign-out", async () => {
    await signInAs('ana', { role: 'student' });
    expect(service.sessionId()).toBe('browser-1');
    await vi.waitFor(() =>
      expect(firestore.setDoc).toHaveBeenCalledWith(
        { path: 'users/ana/sessions/browser-1', id: 'browser-1' },
        expect.objectContaining({ revoked: false }),
      ),
    );

    await service.signOut();
    expect(firestore.deleteDoc).toHaveBeenCalledWith({
      path: 'users/ana/sessions/browser-1',
      id: 'browser-1',
    });
    expect(vi.mocked(firestore.deleteDoc).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(auth.signOut).mock.invocationCallOrder[0],
    );
  });

  it('forgets the session when the user signs out elsewhere', async () => {
    await signInAs('ana', { role: 'student' });
    fb.authCallback!(null);
    await service.whenReady();
    expect(service.sessionId()).toBeNull();
  });

  it('signs out when the session is signed out from another device', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await signInAs('ana', { role: 'student' });
    await vi.waitFor(() => expect(fb.sessionListener).not.toBeNull());
    fb.sessionListener!({ data: () => ({ revoked: true }) });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/login?ended=1'));
    expect(auth.signOut).toHaveBeenCalled();
    expect(firestore.deleteDoc).toHaveBeenCalled();
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
