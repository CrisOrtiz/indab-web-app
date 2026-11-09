import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { FIRESTORE_LOADER } from '../firebase/firebase.providers';
import { FeatureFlags } from './feature-flags.service';

type Listener = { next: (snapshot: unknown) => void; error: (e: unknown) => void };

const fb = vi.hoisted(() => ({
  listeners: [] as Listener[],
  unsubscribes: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  onSnapshot: vi.fn((_ref, next, error) => {
    fb.listeners.push({ next, error });
    const unsubscribe = vi.fn();
    fb.unsubscribes.push(unsubscribe);
    return unsubscribe;
  }),
}));

import * as firestore from 'firebase/firestore';

const snapshot = (data: unknown) => ({ data: () => data });

describe('FeatureFlags', () => {
  const user = signal<{ uid: string } | null>({ uid: 'ana' });
  const isStaff = signal(false);
  let flags: FeatureFlags;

  beforeEach(() => {
    vi.clearAllMocks();
    fb.listeners = [];
    fb.unsubscribes = [];
    user.set({ uid: 'ana' });
    isStaff.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user, isStaff } },
        { provide: FIRESTORE_LOADER, useValue: { load: async () => ({}), instance: () => ({}) } },
      ],
    });
    flags = TestBed.inject(FeatureFlags);
  });

  /** Starts listening and answers with `data`. */
  const load = async (data: unknown) => {
    const ready = flags.whenReady();
    await vi.waitFor(() => expect(fb.listeners.length).toBeGreaterThan(0));
    fb.listeners.at(-1)!.next(snapshot(data));
    await ready;
  };

  it('shows everything until an admin hides something', async () => {
    await load(undefined);
    expect(flags.shown('practice')).toBe(true);
    expect(flags.shown('ranking')).toBe(true);
  });

  it('hides features that are off, and staff-only ones from students', async () => {
    await load({ flags: { practice: 'off', ranking: 'staff' } });
    expect(flags.shown('practice')).toBe(false);
    expect(flags.shown('ranking')).toBe(false);
    expect(flags.shown('exams')).toBe(true);
    isStaff.set(true);
    expect(flags.shown('ranking')).toBe(true);
    expect(flags.shown('practice')).toBe(false);
  });

  it('listens once per account and follows changes', async () => {
    await load({ flags: {} });
    await flags.whenReady();
    expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
    fb.listeners[0].next(snapshot({ flags: { exams: 'off' } }));
    expect(flags.shown('exams')).toBe(false);

    user.set({ uid: 'luis' });
    await load({ flags: {} });
    expect(fb.unsubscribes[0]).toHaveBeenCalled();
    expect(flags.shown('exams')).toBe(true);
  });

  it('shows everything when the flags cannot be read, and tries again later', async () => {
    const ready = flags.whenReady();
    await vi.waitFor(() => expect(fb.listeners.length).toBe(1));
    fb.listeners[0].error(new Error('denied'));
    await ready;
    expect(flags.shown('practice')).toBe(true);
    void flags.whenReady();
    await vi.waitFor(() => expect(fb.listeners.length).toBe(2));
  });

  it('saves one feature, signed by the admin, keeping the others', async () => {
    await load({ flags: {} });
    await flags.setMode('ranking', 'staff');
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: 'config/features' },
      { flags: { ranking: 'staff' }, updatedAt: 'SERVER_TIMESTAMP', updatedBy: 'ana' },
      { merge: true },
    );
    expect(flags.flags()).toEqual({ ranking: 'staff' });
  });
});
