import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { MentorNotesService } from './mentor-notes.service';

const fb = vi.hoisted(() => ({
  docs: {} as Record<string, { id: string; data: object }[]>,
  batch: { set: vi.fn(), commit: vi.fn(async () => undefined) },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  doc: vi.fn((parent: { path: string }, ...ids: string[]) => {
    const docIds = ids.length ? ids : ['new-note'];
    return { path: [parent.path, ...docIds].filter(Boolean).join('/'), id: docIds.at(-1) };
  }),
  query: vi.fn((ref, ...constraints) => ({ ...ref, constraints })),
  where: vi.fn((...args) => ['where', ...args]),
  getDoc: vi.fn(async (ref: { path: string }) => ({ data: () => fb.docs[ref.path]?.[0]?.data })),
  getDocs: vi.fn(async (ref: { path: string }) => ({
    docs: (fb.docs[ref.path] ?? []).map((d) => ({ id: d.id, data: () => d.data })),
  })),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  writeBatch: vi.fn(() => fb.batch),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

import { getDocs, updateDoc } from 'firebase/firestore';

describe('MentorNotesService', () => {
  let service: MentorNotesService;
  const auth = {
    user: signal({ uid: 'coach', email: 'coach@x.co' }),
    profile: signal({ displayName: 'Coach' }),
    isStaff: signal(true),
    isAdmin: signal(false),
  };
  const at = (ms: number) => ({ toMillis: () => ms });

  beforeEach(() => {
    vi.clearAllMocks();
    fb.docs = {};
    auth.isStaff.set(true);
    auth.isAdmin.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: auth },
      ],
    });
    service = TestBed.inject(MentorNotesService);
  });

  it('lists a target’s notes oldest first; students only their own', async () => {
    fb.docs['mentorNotes'] = [
      { id: 'b', data: { text: 'Después', createdAt: at(2) } },
      { id: 'a', data: { text: 'Antes', createdAt: at(1) } },
    ];
    const notes = await service.forTarget({ studentId: 'ana', targetId: 's1' });
    expect(notes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(vi.mocked(getDocs).mock.calls[0][0]).toMatchObject({
      constraints: [['where', 'targetId', '==', 's1']],
    });
    auth.isStaff.set(false);
    await service.forTarget({ studentId: 'ana', targetId: 's1' });
    expect(vi.mocked(getDocs).mock.calls[1][0]).toMatchObject({
      constraints: [
        ['where', 'studentId', '==', 'coach'],
        ['where', 'targetId', '==', 's1'],
      ],
    });
  });

  it('lets mentors of one of the student’s mentorships write, under that mentorship', async () => {
    fb.docs['users/ana'] = [{ id: 'ana', data: { mentorshipIds: ['m9', 'm1'] } }];
    fb.docs['users/luis'] = [{ id: 'luis', data: {} }];
    fb.docs['mentorships'] = [{ id: 'm1', data: {} }];
    expect(await service.access('ana')).toEqual({ canWrite: true, mentorshipId: 'm1' });
    expect(await service.access('luis')).toEqual({ canWrite: false, mentorshipId: null });
    auth.isAdmin.set(true);
    expect(await service.access('luis')).toEqual({ canWrite: true, mentorshipId: null });
    // The mentorships the user leads are read once.
    expect(
      vi
        .mocked(getDocs)
        .mock.calls.filter(([ref]) => (ref as unknown as { path: string }).path === 'mentorships'),
    ).toHaveLength(1);
    expect(await service.access('coach')).toEqual({ canWrite: false, mentorshipId: null });
    auth.isStaff.set(false);
    expect(await service.access('ana')).toEqual({ canWrite: false, mentorshipId: null });
  });

  it('writes the note and the student’s notification in one batch', async () => {
    const id = await service.add(
      { studentId: 'ana', kind: 'evaluation', targetId: 'e1_ana', contextId: 'e1', title: 'Oro' },
      'Buen stop loss.',
      'm1',
    );
    expect(id).toBe('new-note');
    expect(fb.batch.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'mentorNotes/new-note' }),
      {
        studentId: 'ana',
        kind: 'evaluation',
        targetId: 'e1_ana',
        contextId: 'e1',
        mentorshipId: 'm1',
        text: 'Buen stop loss.',
        authorId: 'coach',
        authorName: 'Coach',
        createdAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP',
      },
    );
    expect(fb.batch.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/ana/notifications/note_new-note' }),
      expect.objectContaining({
        type: 'note',
        kind: 'evaluation',
        refId: 'e1_ana',
        contextId: 'e1',
        noteId: 'new-note',
        title: 'Oro',
        studentId: 'ana',
        read: false,
      }),
    );
    expect(fb.batch.commit).toHaveBeenCalled();
  });

  it('edits a note’s text', async () => {
    await service.edit('n1', 'Corregido');
    expect(updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'mentorNotes/n1' }), {
      text: 'Corregido',
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });
});
