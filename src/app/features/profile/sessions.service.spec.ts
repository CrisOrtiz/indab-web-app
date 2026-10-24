import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { DeviceSession } from '../../core/models/user-profile';
import { MAX_SESSIONS, STALE_DAYS, SessionsService, openSessions } from './sessions.service';

const fb = vi.hoisted(() => ({
  batch: { update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  query: vi.fn((ref, ...constraints) => ({ ...ref, constraints })),
  orderBy: vi.fn((field, direction) => ({ orderBy: [field, direction] })),
  limit: vi.fn((n) => ({ limit: n })),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(async () => undefined),
  writeBatch: vi.fn(() => fb.batch),
}));

import * as firestore from 'firebase/firestore';

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 24);
const session = (id: string, daysAgo: number, revoked = false) =>
  ({ id, revoked, lastSeen: { toMillis: () => now - daysAgo * DAY } }) as DeviceSession;

describe('openSessions', () => {
  it('hides signed-out and long unused sessions', () => {
    const list = [session('a', 1), session('b', 2, true), session('c', STALE_DAYS + 1)];
    expect(openSessions(list, now).map((s) => s.id)).toEqual(['a']);
  });
});

describe('SessionsService', () => {
  let service: SessionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: FIRESTORE, useValue: {} }] });
    service = TestBed.inject(SessionsService);
  });

  it('listens to the latest sessions with estimated server times', () => {
    const next = vi.fn();
    const data = vi.fn(() => ({ browser: 'Chrome' }));
    vi.mocked(firestore.onSnapshot).mockImplementation(((
      _q: unknown,
      onNext: (s: unknown) => void,
    ) => {
      onNext({ docs: [{ id: 's1', data }] });
      return () => undefined;
    }) as never);
    service.watch('ana', next, vi.fn());
    expect(firestore.query).toHaveBeenCalledWith(
      { path: 'users/ana/sessions' },
      { orderBy: ['lastSeen', 'desc'] },
      { limit: MAX_SESSIONS },
    );
    expect(data).toHaveBeenCalledWith({ serverTimestamps: 'estimate' });
    expect(next).toHaveBeenCalledWith([{ id: 's1', browser: 'Chrome' }]);
  });

  it('signs one or several sessions out', async () => {
    await service.signOut('ana', 's1');
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      { path: 'users/ana/sessions/s1' },
      { revoked: true },
    );
    await service.signOutAll('ana', ['s2', 's3']);
    expect(fb.batch.update).toHaveBeenCalledTimes(2);
    expect(fb.batch.update).toHaveBeenCalledWith(
      { path: 'users/ana/sessions/s3' },
      { revoked: true },
    );
    expect(fb.batch.commit).toHaveBeenCalled();
  });

  it('deletes long unused sessions but keeps signed-out ones', async () => {
    await service.prune(
      'ana',
      [session('a', 1), session('b', STALE_DAYS + 5, true), session('c', STALE_DAYS + 1)],
      now,
    );
    expect(fb.batch.delete).toHaveBeenCalledExactlyOnceWith({ path: 'users/ana/sessions/c' });
    vi.clearAllMocks();
    await service.prune('ana', [session('a', 1)], now);
    expect(firestore.writeBatch).not.toHaveBeenCalled();
  });
});
