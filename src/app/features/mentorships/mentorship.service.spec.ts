import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { MentorshipService, sortMentorships } from './mentorship.service';

const fb = vi.hoisted(() => ({
  docs: {} as Record<string, { id: string; data: object }[]>,
  batch: { update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path: string) => ({ path })),
  doc: vi.fn((parent: { path: string }, id?: string) => {
    const docId = id ?? 'new-id';
    return { path: `${parent.path}/${docId}`, id: docId };
  }),
  query: vi.fn((ref, ...constraints) => ({ ...ref, constraints })),
  where: vi.fn((...args) => ['where', ...args]),
  getDocs: vi.fn(async (ref: { path: string }) => ({
    docs: (fb.docs[ref.path] ?? []).map((d) => ({
      id: d.id,
      ref: { path: `${ref.path}/${d.id}` },
      data: () => d.data,
    })),
  })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  writeBatch: vi.fn(() => fb.batch),
  arrayRemove: vi.fn((value: string) => ({ arrayRemove: value })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

import { setDoc, updateDoc, where } from 'firebase/firestore';

describe('MentorshipService', () => {
  let service: MentorshipService;
  const input = {
    name: 'Grupo oro',
    description: '',
    mentorIds: ['coach'],
    startDate: '2026-10-01',
    endDate: null,
    active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fb.docs = {};
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: { user: signal({ uid: 'boss' }) } },
      ],
    });
    service = TestBed.inject(MentorshipService);
  });

  it('lists mentorships, active ones first and then by name', async () => {
    fb.docs['mentorships'] = [
      { id: 'b', data: { name: 'Índices', active: true } },
      { id: 'c', data: { name: 'Antigua', active: false } },
      { id: 'a', data: { name: 'Acciones', active: true } },
    ];
    expect((await service.all()).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('creates a mentorship signed by the admin, and edits it', async () => {
    expect(await service.create(input)).toBe('new-id');
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'mentorships/new-id', id: 'new-id' },
      { ...input, createdBy: 'boss', createdAt: 'SERVER_TIMESTAMP', updatedAt: 'SERVER_TIMESTAMP' },
    );
    await service.update('m1', { active: false });
    expect(updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'mentorships/m1' }), {
      active: false,
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('deletes a mentorship and takes it off its students together', async () => {
    fb.docs['users'] = [
      { id: 'ana', data: { mentorshipIds: ['m1'] } },
      { id: 'luis', data: { mentorshipIds: ['m1', 'm2'] } },
    ];
    await service.remove('m1');
    expect(where).toHaveBeenCalledWith('mentorshipIds', 'array-contains', 'm1');
    expect(fb.batch.update).toHaveBeenCalledWith(
      { path: 'users/ana' },
      { mentorshipIds: { arrayRemove: 'm1' } },
    );
    expect(fb.batch.update).toHaveBeenCalledWith(
      { path: 'users/luis' },
      { mentorshipIds: { arrayRemove: 'm1' } },
    );
    expect(fb.batch.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'mentorships/m1' }),
    );
    expect(fb.batch.commit).toHaveBeenCalledOnce();
  });

  it('sorts without changing the list it gets', () => {
    const list = [
      { name: 'b', active: false },
      { name: 'a', active: true },
    ] as never[];
    expect(sortMentorships(list).map((m: { name: string }) => m.name)).toEqual(['a', 'b']);
    expect((list[0] as { name: string }).name).toBe('b');
  });
});
