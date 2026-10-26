import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { ExamService } from './exam.service';

const fb = vi.hoisted(() => ({
  docs: {} as Record<string, { id: string; data: object }[]>,
  single: {} as Record<string, object>,
  batch: { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path: string) => ({ path })),
  doc: vi.fn((parent: { path: string }, id?: string) => {
    const docId = id ?? 'new-id';
    return { path: `${parent.path}/${docId}`, id: docId };
  }),
  query: vi.fn((ref, ...constraints) => ({ ...ref, constraints })),
  where: vi.fn((...args) => ['where', ...args]),
  getDocs: vi.fn(async (ref: { path: string; constraints?: unknown[][] }) => {
    // Forms for everyone and forms for one student come from separate queries.
    const audience = ref.constraints?.find((c) => c[1] === 'audience');
    const docs = (fb.docs[ref.path] ?? []).filter(
      (d) => !audience || (d.data as { audience?: string }).audience === audience[3],
    );
    return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
  }),
  getDoc: vi.fn(async (ref: { path: string; id: string }) => {
    const data = fb.single[ref.path];
    return { id: ref.id, exists: () => !!data, data: () => data };
  }),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  writeBatch: vi.fn(() => fb.batch),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

import { getDoc, setDoc, updateDoc, where } from 'firebase/firestore';

const at = (ms: number) => ({ toMillis: () => ms });

describe('ExamService', () => {
  let service: ExamService;
  const input = {
    title: 'Fundamentos',
    description: '',
    totalPoints: 100,
    passingPoints: 70,
    durationMinutes: 30,
    maxAttempts: 2,
    audience: 'all' as const,
    studentIds: [],
    opensAt: new Date(2026, 9, 26),
    closesAt: new Date(2026, 10, 2),
    questions: [],
    published: true,
    resultsPublished: false,
    showAnswers: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fb.docs = {};
    fb.single = {};
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            user: signal({ uid: 'jose', email: 'jose@x.co' }),
            profile: signal({ displayName: 'José Pérez' }),
          },
        },
      ],
    });
    service = TestBed.inject(ExamService);
  });

  it('saves a new form and its answer key together', async () => {
    expect(await service.save(null, input, { answers: { q1: [0] } })).toBe('new-id');
    expect(fb.batch.set).toHaveBeenCalledWith(
      { path: 'examForms/new-id', id: 'new-id' },
      { ...input, createdBy: 'jose', createdAt: 'SERVER_TIMESTAMP', updatedAt: 'SERVER_TIMESTAMP' },
    );
    expect(fb.batch.set).toHaveBeenCalledWith(
      { path: 'examKeys/new-id', id: 'new-id' },
      { answers: { q1: [0] }, updatedAt: 'SERVER_TIMESTAMP' },
    );
    expect(fb.batch.commit).toHaveBeenCalled();
  });

  it('updates an existing form without touching its author', async () => {
    await service.save('x1', input, { answers: {} });
    expect(fb.batch.update).toHaveBeenCalledWith(
      { path: 'examForms/x1', id: 'x1' },
      { ...input, updatedAt: 'SERVER_TIMESTAMP' },
    );
  });

  it("merges a student's forms for everyone and the ones assigned to them", async () => {
    fb.docs['examForms'] = [
      { id: 'all', data: { audience: 'all', opensAt: at(1) } },
      { id: 'mine', data: { audience: 'selected', studentIds: ['jose'], opensAt: at(2) } },
    ];
    expect((await service.assignedTo('jose')).map((e) => e.id)).toEqual(['mine', 'all']);
    expect(where).toHaveBeenCalledWith('published', '==', true);
    expect(where).toHaveBeenCalledWith('studentIds', 'array-contains', 'jose');
  });

  it('starts, saves and hands in an attempt', async () => {
    const exam = { ...input, id: 'x1' } as never;
    expect(await service.start(exam, 2)).toBe('x1_jose_2');
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'examSubmissions/x1_jose_2', id: 'x1_jose_2' },
      {
        examId: 'x1',
        uid: 'jose',
        userName: 'José Pérez',
        attempt: 2,
        status: 'inProgress',
        answers: {},
        startedAt: 'SERVER_TIMESTAMP',
        submittedAt: null,
      },
    );
    const answers = { q1: { choices: [1], text: '' } };
    await service.saveAnswers('x1_jose_2', answers);
    expect(updateDoc).toHaveBeenLastCalledWith(
      { path: 'examSubmissions/x1_jose_2', id: 'x1_jose_2' },
      { answers },
    );
    await service.submit('x1_jose_2', answers);
    expect(updateDoc).toHaveBeenLastCalledWith(
      { path: 'examSubmissions/x1_jose_2', id: 'x1_jose_2' },
      { answers, status: 'submitted', submittedAt: 'SERVER_TIMESTAMP' },
    );
  });

  it('writes a grade under the attempt id, signed by the grader', async () => {
    const grade = {
      examId: 'x1',
      uid: 'luis',
      attempt: 1,
      scores: { q1: 10 },
      comments: {},
      feedback: '',
      total: 10,
      passed: false,
    };
    await service.saveGrade(grade);
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'examGrades/x1_luis_1', id: 'x1_luis_1' },
      { ...grade, gradedBy: 'jose', gradedAt: 'SERVER_TIMESTAMP' },
    );
  });

  it('reads only the grades a student may see', async () => {
    fb.single['examGrades/x1_jose_1'] = { total: 80 };
    vi.mocked(getDoc).mockImplementationOnce(async () => {
      throw new Error('permission-denied');
    });
    const grades = await service.myGrades([
      { id: 'x1_jose_2' },
      { id: 'x1_jose_1' },
      { id: 'x1_jose_3' },
    ] as never);
    expect(grades).toEqual([{ total: 80, id: 'x1_jose_1' }]);
  });
});
