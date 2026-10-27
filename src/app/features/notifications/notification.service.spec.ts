import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { DEFAULT_SETTINGS } from '../../core/models/notification';
import { NotificationService } from './notification.service';

const fb = vi.hoisted(() => ({
  docs: {} as Record<string, { id: string; data: object }[]>,
  denied: new Set<string>(),
  batches: [] as {
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
  }[],
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  doc: vi.fn((parent: { path: string }, ...ids: string[]) => {
    const path = [parent.path, ...ids].filter(Boolean).join('/');
    return { path, id: ids.at(-1) };
  }),
  query: vi.fn((ref, ...constraints) => ({ ...ref, constraints })),
  orderBy: vi.fn((...args) => ['orderBy', ...args]),
  limit: vi.fn((n) => ['limit', n]),
  onSnapshot: vi.fn(() => () => undefined),
  getDoc: vi.fn(async (ref: { path: string }) => {
    const data = fb.docs[ref.path]?.[0]?.data;
    return { exists: () => !!data, data: () => data };
  }),
  getDocs: vi.fn(async (ref: { path: string }) => {
    if (fb.denied.has(ref.path)) {
      throw new Error('permission-denied');
    }
    return {
      docs: (fb.docs[ref.path] ?? []).map((d) => ({ id: d.id, data: () => d.data })),
    };
  }),
  setDoc: vi.fn(async (ref: { path: string }) => {
    if (fb.denied.has(ref.path)) {
      throw new Error('permission-denied');
    }
  }),
  writeBatch: vi.fn(() => {
    const batch = {
      set: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      commit: vi.fn(async () => undefined),
    };
    fb.batches.push(batch);
    return batch;
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

import { onSnapshot, setDoc } from 'firebase/firestore';

describe('NotificationService', () => {
  let service: NotificationService;
  const auth = {
    user: signal<{ uid: string; email: string } | null>({ uid: 'ana', email: 'ana@x.co' }),
    profile: signal<{ displayName: string; mentorshipIds?: string[] } | null>({
      displayName: 'Ana',
      mentorshipIds: ['m1', 'm2'],
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fb.docs = {};
    fb.denied = new Set();
    fb.batches = [];
    auth.user.set({ uid: 'ana', email: 'ana@x.co' });
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: auth },
      ],
    });
    service = TestBed.inject(NotificationService);
  });

  it('listens to the latest notifications, newest first', () => {
    const next = vi.fn();
    service.listen('ana', next);
    const [ref, onNext] = vi.mocked(onSnapshot).mock.calls[0] as unknown as [
      { path: string; constraints: unknown[] },
      (snapshot: unknown) => void,
    ];
    expect(ref.path).toBe('users/ana/notifications');
    expect(ref.constraints).toEqual([
      ['orderBy', 'createdAt', 'desc'],
      ['limit', 30],
    ]);
    onNext({ docs: [{ id: 'n1', data: () => ({ type: 'note', read: false }) }] });
    expect(next).toHaveBeenCalledWith([{ id: 'n1', type: 'note', read: false }]);
  });

  it('marks notifications as read in one batch', async () => {
    await service.markRead('ana', ['a', 'b']);
    expect(fb.batches[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/ana/notifications/a' }),
      { read: true },
    );
    expect(fb.batches[0].update).toHaveBeenCalledTimes(2);
  });

  it('reads the settings, with nothing followed by default', async () => {
    expect(await service.settings('coach')).toEqual(DEFAULT_SETTINGS);
    fb.docs['users/coach/settings/notifications'] = [
      { id: 'notifications', data: { studentIds: ['ana'] } },
    ];
    expect(await service.settings('coach')).toEqual({ ...DEFAULT_SETTINGS, studentIds: ['ana'] });
  });

  it('saves the settings and mirrors them in the follower lists', async () => {
    const previous = { ...DEFAULT_SETTINGS, studentIds: ['ana', 'jose'] };
    const next = {
      ...DEFAULT_SETTINGS,
      types: ['examSubmitted' as const],
      studentIds: ['ana'],
      mentorshipIds: ['m1'],
      all: true,
    };
    await service.saveSettings('coach', next, previous);
    const batch = fb.batches[0];
    const sets = batch.set.mock.calls.map(([ref, data]) => [ref.path, data]);
    expect(sets).toContainEqual([
      'follows/student/subjects/ana/followers/coach',
      { types: ['examSubmitted'], updatedAt: 'SERVER_TIMESTAMP' },
    ]);
    expect(sets.map(([path]) => path)).toEqual([
      'follows/student/subjects/ana/followers/coach',
      'follows/all/subjects/all/followers/coach',
      'follows/mentorship/subjects/m1/followers/coach',
      'users/coach/settings/notifications',
    ]);
    expect(batch.delete.mock.calls.map(([ref]) => ref.path)).toEqual([
      'follows/student/subjects/jose/followers/coach',
    ]);
  });

  it('follows nothing when no kind of activity is chosen', async () => {
    const settings = { ...DEFAULT_SETTINGS, types: [], studentIds: ['ana'] };
    await service.saveSettings('coach', settings, settings);
    expect(fb.batches[0].delete.mock.calls.map(([ref]) => ref.path)).toEqual([
      'follows/student/subjects/ana/followers/coach',
    ]);
  });

  it('tells students once each, never the sender, and counts what went out', async () => {
    auth.user.set({ uid: 'coach', email: 'coach@x.co' });
    fb.denied.add('users/luis/notifications/assigned_e1');
    const sent = await service.notifyStudents(
      'assigned',
      'evaluation',
      { id: 'e1', title: 'Final de oro' },
      ['ana', 'ana', 'coach', 'luis'],
    );
    expect(sent).toBe(1);
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/ana/notifications/assigned_e1' }),
      expect.objectContaining({
        type: 'assigned',
        kind: 'evaluation',
        refId: 'e1',
        contextId: 'e1',
        title: 'Final de oro',
        studentId: 'ana',
        actorId: 'coach',
        read: false,
      }),
    );
  });

  describe('student activity', () => {
    const event = {
      type: 'evaluationFinished' as const,
      kind: 'evaluation' as const,
      refId: 'e1_ana',
      contextId: 'e1',
      title: 'Final de oro',
    };

    it('reaches each follower once, by the first subject that asked for it', async () => {
      fb.docs['follows/student/subjects/ana/followers'] = [
        { id: 'coach', data: { types: ['practiceFinished'] } },
      ];
      fb.docs['follows/mentorship/subjects/m2/followers'] = [
        { id: 'coach', data: { types: ['evaluationFinished'] } },
        { id: 'boss', data: { types: ['evaluationFinished'] } },
      ];
      fb.docs['follows/evaluation/subjects/e1/followers'] = [
        { id: 'boss', data: { types: ['evaluationFinished'] } },
      ];
      fb.denied.add('follows/mentorship/subjects/m1/followers');
      expect(await service.recipients(event)).toEqual([
        { uid: 'coach', followKind: 'mentorship', followId: 'm2' },
        { uid: 'boss', followKind: 'mentorship', followId: 'm2' },
      ]);
      expect(await service.notifyActivity(event)).toBe(2);
      expect(setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/boss/notifications/evaluationFinished_e1_ana' }),
        expect.objectContaining({
          ...event,
          actorId: 'ana',
          actorName: 'Ana',
          studentId: 'ana',
          followKind: 'mentorship',
          followId: 'm2',
        }),
      );
    });

    it('looks up forms and free practice in their own lists', async () => {
      fb.docs['follows/exam/subjects/x1/followers'] = [
        { id: 'coach', data: { types: ['examSubmitted'] } },
      ];
      fb.docs['follows/all/subjects/all/followers'] = [
        { id: 'boss', data: { types: ['practiceFinished'] } },
      ];
      expect(
        await service.recipients({
          type: 'examSubmitted',
          kind: 'exam',
          refId: 'x1_ana_1',
          contextId: 'x1',
          title: '',
        }),
      ).toEqual([{ uid: 'coach', followKind: 'exam', followId: 'x1' }]);
      expect(
        await service.recipients({
          type: 'practiceFinished',
          kind: 'practice',
          refId: 's1',
          contextId: null,
          title: '',
        }),
      ).toEqual([{ uid: 'boss', followKind: 'all', followId: 'all' }]);
    });

    it('never throws', async () => {
      auth.profile.set(null);
      fb.denied.add('follows/student/subjects/ana/followers');
      fb.docs['follows/all/subjects/all/followers'] = [
        { id: 'boss', data: { types: ['evaluationFinished'] } },
      ];
      fb.denied.add('users/boss/notifications/evaluationFinished_e1_ana');
      expect(await service.notifyActivity(event)).toBe(0);
    });
  });
});
