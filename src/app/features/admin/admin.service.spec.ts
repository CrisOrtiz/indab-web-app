import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { AdminService } from './admin.service';

type Listener = { next: (snapshot: unknown) => void; error: (e: unknown) => void };

const fb = vi.hoisted(() => ({
  listeners: new Map<string, Listener>(),
  unsubscribes: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path: string) => ({ path })),
  doc: vi.fn((_db, collection: string, id: string) => ({ path: `${collection}/${id}` })),
  onSnapshot: vi.fn((ref: { path: string }, next, error) => {
    fb.listeners.set(ref.path, { next, error });
    const unsubscribe = vi.fn();
    fb.unsubscribes.push(unsubscribe);
    return unsubscribe;
  }),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

import { setDoc, updateDoc } from 'firebase/firestore';

const docs = (entries: Record<string, object>) => ({
  docs: Object.entries(entries).map(([id, data]) => ({ id, data: () => data })),
});

// AdminService is provided per component, like in the real app.
@Component({ template: '', providers: [AdminService] })
class Host {
  readonly admin = inject(AdminService);
}

describe('AdminService', () => {
  let admin: AdminService;
  let destroy: () => void;
  const isAdmin = signal(true);

  const create = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: { user: signal({ uid: 'boss' }), isAdmin } },
      ],
    });
    admin = TestBed.createComponent(Host).componentInstance.admin;
  };

  it('opens no listeners for trainers', () => {
    fb.listeners.clear();
    isAdmin.set(false);
    create();
    expect(fb.listeners.size).toBe(0);
    expect(admin.loading()).toBe(false);
    isAdmin.set(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fb.listeners.clear();
    fb.unsubscribes = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: { user: signal({ uid: 'boss' }), isAdmin } },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    admin = fixture.componentInstance.admin;
    destroy = () => fixture.destroy();
  });

  const emit = (path: 'users' | 'enrollments', entries: Record<string, object>) =>
    fb.listeners.get(path)!.next(docs(entries));

  it('joins users with their enrollments, sorted by name', () => {
    expect(admin.loading()).toBe(true);
    emit('users', {
      u2: { displayName: 'Zoe', role: 'student' },
      u1: { displayName: 'Ana', role: 'admin' },
    });
    emit('enrollments', { u2: { academy: true, courses: ['forex-101'] } });

    expect(admin.loading()).toBe(false);
    expect(admin.error()).toBeNull();
    expect(admin.users().map((row) => [row.profile.uid, row.enrollment?.academy ?? null])).toEqual([
      ['u1', null],
      ['u2', true],
    ]);
  });

  it('uses the document id as uid', () => {
    emit('users', { real: { uid: 'spoofed', displayName: 'X', role: 'student' } });
    expect(admin.users()[0].profile.uid).toBe('real');
  });

  it('shows an error when the lists cannot be read', () => {
    fb.listeners.get('users')!.error(new Error('permission-denied'));
    expect(admin.loading()).toBe(false);
    expect(admin.error()).toContain('No se pudo cargar la lista de usuarios');
  });

  it('updates only the role', async () => {
    await admin.setRole('u2', 'admin');
    expect(updateDoc).toHaveBeenCalledWith({ path: 'users/u2' }, { role: 'admin' });
  });

  it('toggles academy access, keeping course enrollments and recording the admin', async () => {
    emit('enrollments', { u2: { academy: false, courses: ['forex-101'] } });
    await admin.setAcademyAccess('u2', true);
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'enrollments/u2' },
      { academy: true, courses: ['forex-101'], updatedAt: 'SERVER_TIMESTAMP', updatedBy: 'boss' },
    );

    await admin.setAcademyAccess('new', true);
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: 'enrollments/new' },
      expect.objectContaining({ academy: true, courses: [] }),
    );
  });

  it('stops both listeners when the page is left', () => {
    expect(fb.unsubscribes).toHaveLength(2);
    destroy();
    fb.unsubscribes.forEach((unsubscribe) => expect(unsubscribe).toHaveBeenCalledOnce());
  });
});
