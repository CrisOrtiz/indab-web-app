import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FIRESTORE } from '../../../core/firebase/firebase.providers';
import { ExamService } from '../../exams/exam.service';
import { PracticeService } from '../../practice/practice.service';
import { MentorDashboardService } from './mentor-dashboard.service';

type Ref = { path: string; group?: boolean; constraints?: unknown[][] };

const fb = vi.hoisted(() => ({
  /** Documents returned by `getDocs`, picked by the query. */
  docs: (_ref: unknown): { id: string; data: object }[] => [],
  /** Values returned by `getAggregateFromServer`, picked by the query. */
  aggregate: (_ref: unknown): Record<string, number | null | undefined> => ({}),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path: string) => ({ path })),
  collectionGroup: vi.fn((_db, path: string) => ({ path, group: true })),
  query: vi.fn((ref: Ref, ...constraints: unknown[][]) => ({
    ...ref,
    constraints: [...(ref.constraints ?? []), ...constraints],
  })),
  where: vi.fn((...args) => ['where', ...args]),
  orderBy: vi.fn((...args) => ['orderBy', ...args]),
  limit: vi.fn((n: number) => ['limit', n]),
  count: vi.fn(() => 'count'),
  sum: vi.fn((field: string) => `sum:${field}`),
  getDocs: vi.fn(async (ref: Ref) => ({
    docs: fb.docs(ref).map((d) => ({ id: d.id, data: () => d.data })),
  })),
  getAggregateFromServer: vi.fn(async (ref: Ref) => ({ data: () => fb.aggregate(ref) })),
}));

const has = (ref: Ref, ...where: unknown[]) =>
  (ref.constraints ?? []).some((c) => JSON.stringify(c) === JSON.stringify(['where', ...where]));
const ts = (date: Date) => ({ toDate: () => date, toMillis: () => date.getTime() });

describe('MentorDashboardService', () => {
  let service: MentorDashboardService;
  const exams = { submissions: vi.fn(), grades: vi.fn() };
  const practice = { evaluationSessions: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    fb.docs = () => [];
    fb.aggregate = () => ({});
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: ExamService, useValue: exams },
        { provide: PracticeService, useValue: practice },
      ],
    });
    service = TestBed.inject(MentorDashboardService);
  });

  it("lists the mentorship's students by name, leaving staff out", async () => {
    fb.docs = (ref) =>
      has(ref as Ref, 'mentorshipIds', 'array-contains', 'm1')
        ? [
            { id: 'u2', data: { displayName: 'Luis', role: 'student', mentorshipIds: ['m1'] } },
            { id: 'u1', data: { email: 'ana@x.co', role: 'student', mentorshipIds: ['m1'] } },
            { id: 'coach', data: { displayName: 'Coach', role: 'trainer' } },
          ]
        : [];
    expect(await service.members('m1')).toEqual([
      { uid: 'u1', name: 'ana@x.co', email: 'ana@x.co', mentorshipIds: ['m1'] },
      { uid: 'u2', name: 'Luis', email: '', mentorshipIds: ['m1'] },
    ]);
  });

  it("counts a student's practice with aggregations, not by reading every trade", async () => {
    const from = new Date(2026, 9, 26);
    const last = new Date(2026, 9, 27);
    fb.aggregate = (q) => {
      const ref = q as Ref;
      if (!ref.group) {
        return has(ref, 'startedAt', '>=', from) ? { sessions: 3, pnl: 42.5 } : {};
      }
      return { n: has(ref, 'pnl', '>', 0) ? 4 : 6 };
    };
    fb.docs = (ref) =>
      (ref as Ref).path === 'practiceSessions' ? [{ id: 's1', data: { startedAt: ts(last) } }] : [];

    expect(await service.activity('u1', from)).toEqual({
      sessions: 3,
      pnl: 42.5,
      closedTrades: 6,
      wins: 4,
      lastPractice: last,
    });
  });

  it('reports no practice for a student who never practised', async () => {
    fb.aggregate = (q) => ((q as Ref).group ? { n: 0 } : { sessions: 0, pnl: null });
    expect(await service.activity('u1', new Date())).toEqual({
      sessions: 0,
      pnl: 0,
      closedTrades: 0,
      wins: 0,
      lastPractice: null,
    });
  });

  it("finds the group's forms and evaluations in the period with who handed them in", async () => {
    const now = new Date(2026, 9, 28);
    const from = new Date(2026, 9, 26);
    const members = [
      { uid: 'ana', name: 'Ana', email: '', mentorshipIds: ['m1'] },
      { uid: 'luis', name: 'Luis', email: '', mentorshipIds: ['m1', 'm2'] },
    ];
    const window = (opens: Date, closes: Date) => ({ opensAt: ts(opens), closesAt: ts(closes) });
    fb.docs = (q) => {
      const ref = q as Ref;
      if (
        ref.path === 'examForms' &&
        has(ref, 'mentorshipIds', 'array-contains-any', ['m1', 'm2'])
      ) {
        return [
          {
            id: 'f1',
            data: {
              title: 'Examen 1',
              published: true,
              audience: 'selected',
              studentIds: [],
              mentorshipIds: ['m1'],
              totalPoints: 10,
              ...window(new Date(2026, 9, 20), new Date(2026, 9, 30)),
            },
          },
          // A draft and a form that closed before the period are left out.
          {
            id: 'draft',
            data: {
              title: 'Borrador',
              published: false,
              audience: 'selected',
              studentIds: [],
              mentorshipIds: ['m1'],
              ...window(new Date(2026, 9, 20), new Date(2026, 9, 30)),
            },
          },
          {
            id: 'old',
            data: {
              title: 'Viejo',
              published: true,
              audience: 'selected',
              studentIds: [],
              mentorshipIds: ['m1'],
              ...window(new Date(2026, 8, 1), new Date(2026, 8, 5)),
            },
          },
        ];
      }
      if (
        ref.path === 'evaluations' &&
        has(ref, 'studentIds', 'array-contains-any', ['ana', 'luis'])
      ) {
        return [
          {
            id: 'e1',
            data: {
              title: 'Evaluación',
              studentIds: ['luis', 'outsider'],
              ...window(new Date(2026, 9, 1), new Date(2026, 9, 27)),
            },
          },
        ];
      }
      return [];
    };
    exams.submissions.mockResolvedValue([
      { uid: 'ana', status: 'submitted' },
      { uid: 'luis', status: 'inProgress' },
    ]);
    exams.grades.mockResolvedValue([
      { uid: 'ana', total: 6, attempt: 1 },
      { uid: 'ana', total: 8, attempt: 2 },
    ]);
    practice.evaluationSessions.mockResolvedValue([
      { uid: 'luis', pnl: -12 },
      { uid: 'outsider', pnl: 50 },
    ]);

    const deliveries = await service.deliveries(members, from, now);

    expect(deliveries).toEqual([
      expect.objectContaining({
        kind: 'form',
        id: 'f1',
        open: true,
        assigned: ['ana', 'luis'],
        done: ['ana'],
        results: { ana: 0.8 },
      }),
      expect.objectContaining({
        kind: 'evaluation',
        id: 'e1',
        open: false,
        assigned: ['luis'],
        done: ['luis'],
        results: { luis: -12 },
      }),
    ]);
  });

  it('reads nothing for a mentorship without students', async () => {
    expect(await service.deliveries([], new Date())).toEqual([]);
    expect(exams.submissions).not.toHaveBeenCalled();
  });
});
