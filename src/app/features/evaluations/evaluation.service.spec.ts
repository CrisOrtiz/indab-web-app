import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { EvaluationService } from './evaluation.service';

const fb = vi.hoisted(() => ({ docs: {} as Record<string, { id: string; data: object }[]> }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path: string) => ({ path })),
  doc: vi.fn((parent: { path: string }, id?: string) => {
    const docId = id ?? 'new-id';
    return { path: `${parent.path}/${docId}`, id: docId };
  }),
  query: vi.fn((ref, ...constraints) => ({ ...ref, constraints })),
  where: vi.fn((...args) => ['where', ...args]),
  getDocs: vi.fn(async (ref: { path: string }) => ({
    docs: (fb.docs[ref.path] ?? []).map((d) => ({ id: d.id, data: () => d.data })),
  })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

import { deleteDoc, setDoc, updateDoc, where } from 'firebase/firestore';

const at = (ms: number) => ({ toMillis: () => ms });

describe('EvaluationService', () => {
  let service: EvaluationService;
  const input = {
    title: 'Oro',
    description: '',
    symbol: 'PAXGUSDT',
    replayStart: 1000,
    hideDates: true,
    startingBalance: 200,
    durationMinutes: 30,
    opensAt: new Date(2026, 9, 24),
    closesAt: new Date(2026, 9, 31),
    studentIds: ['u1'],
    resultsPublished: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fb.docs = {};
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: { user: signal({ uid: 'coach' }) } },
      ],
    });
    service = TestBed.inject(EvaluationService);
  });

  it('lists evaluations, newest window first', async () => {
    fb.docs['evaluations'] = [
      { id: 'old', data: { title: 'Antigua', opensAt: at(1) } },
      { id: 'new', data: { title: 'Nueva', opensAt: at(2) } },
    ];
    expect((await service.all()).map((e) => e.id)).toEqual(['new', 'old']);
    expect((await service.assignedTo('u1')).map((e) => e.id)).toEqual(['new', 'old']);
    expect(where).toHaveBeenCalledWith('studentIds', 'array-contains', 'u1');
    expect(where).not.toHaveBeenCalledWith('mentorshipIds', 'array-contains-any', []);
  });

  it("also lists the evaluations of the student's mentorships, once each", async () => {
    fb.docs['evaluations'] = [
      { id: 'a', data: { title: 'A', opensAt: at(1) } },
      { id: 'b', data: { title: 'B', opensAt: at(2) } },
    ];
    // The fake returns both for each query: they must not repeat.
    expect((await service.assignedTo('u1', ['m1', 'm2'])).map((e) => e.id)).toEqual(['b', 'a']);
    expect(where).toHaveBeenCalledWith('mentorshipIds', 'array-contains-any', ['m1', 'm2']);
  });

  it('creates an evaluation signed by the trainer', async () => {
    expect(await service.create(input)).toBe('new-id');
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'evaluations/new-id', id: 'new-id' },
      {
        ...input,
        createdBy: 'coach',
        createdAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP',
      },
    );
  });

  it('edits, publishes and deletes', async () => {
    await service.update('e1', input);
    expect(updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'evaluations/e1' }), {
      ...input,
      updatedAt: 'SERVER_TIMESTAMP',
    });
    await service.setResultsPublished('e1', true);
    expect(updateDoc).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: 'evaluations/e1' }),
      { resultsPublished: true, updatedAt: 'SERVER_TIMESTAMP' },
    );
    await service.remove('e1');
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'evaluations/e1' }));
  });

  it('lists students by name with their academy access', async () => {
    fb.docs['users'] = [
      { id: 'b', data: { displayName: 'Bea', email: 'b@x.co', role: 'student' } },
      {
        id: 'a',
        data: { displayName: '', email: 'ana@x.co', role: 'student', mentorshipIds: ['m1'] },
      },
      { id: 't', data: { displayName: 'Coach', email: 't@x.co', role: 'trainer' } },
      { id: 'z', data: { displayName: 'Admin', email: 'z@x.co', role: 'admin' } },
    ];
    fb.docs['enrollments'] = [{ id: 'b', data: { academy: true, courses: [] } }];
    const students = [
      { uid: 'a', name: 'ana@x.co', email: 'ana@x.co', academy: false, mentorshipIds: ['m1'] },
      { uid: 'b', name: 'Bea', email: 'b@x.co', academy: true, mentorshipIds: [] },
    ];
    expect(await service.students()).toEqual(students);
    // Trainers and admins can lead mentorships.
    expect(await service.directory()).toEqual({
      students,
      staff: [
        { uid: 'z', name: 'Admin', role: 'admin' },
        { uid: 't', name: 'Coach', role: 'trainer' },
      ],
    });
  });
});
