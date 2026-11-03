import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { MaterialService } from './material.service';

const fb = vi.hoisted(() => ({
  /** Documents each query returns, by the value of its last `where`. */
  byFilter: {} as Record<string, { id: string; data: object }[]>,
  all: [] as { id: string; data: object }[],
  one: null as { id: string; data: object } | null,
  denied: false,
}));

vi.mock('firebase/firestore', () => {
  const snapshot = (list: { id: string; data: object }[]) => ({
    docs: list.map((d) => ({ id: d.id, data: () => d.data })),
  });
  return {
    collection: vi.fn((_db, path: string) => ({ path })),
    doc: vi.fn((parent: { path: string }, id?: string) => ({
      path: `${parent.path}/${id ?? 'new-id'}`,
      id: id ?? 'new-id',
    })),
    query: vi.fn((ref, ...constraints) => ({ ...ref, constraints })),
    where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
    getDocs: vi.fn(async (ref: { constraints?: { field: string }[] }) => {
      const last = ref.constraints?.at(-1);
      return snapshot(last ? (fb.byFilter[last.field] ?? []) : fb.all);
    }),
    getDoc: vi.fn(async () => {
      if (fb.denied) {
        throw new Error('permission-denied');
      }
      return { exists: () => !!fb.one, id: fb.one?.id, data: () => fb.one?.data };
    }),
    setDoc: vi.fn(async () => undefined),
    updateDoc: vi.fn(async () => undefined),
    deleteDoc: vi.fn(async () => undefined),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  };
});

import { deleteDoc, getDocs, setDoc, updateDoc, where } from 'firebase/firestore';

const at = (ms: number) => ({ toMillis: () => ms });

describe('MaterialService', () => {
  let service: MaterialService;
  const isStaff = signal(false);
  const profile = signal<{ mentorshipIds?: string[] } | null>({ mentorshipIds: ['g1'] });

  beforeEach(() => {
    vi.clearAllMocks();
    fb.byFilter = {};
    fb.all = [];
    fb.one = null;
    fb.denied = false;
    isStaff.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        {
          provide: AuthService,
          useValue: { user: signal({ uid: 'ana' }), isStaff, profile },
        },
      ],
    });
    service = TestBed.inject(MaterialService);
  });

  it("joins material for everyone, for the student and for the student's mentorships", async () => {
    fb.byFilter['audience'] = [{ id: 'a', data: { title: 'A', createdAt: at(1) } }];
    fb.byFilter['studentIds'] = [
      { id: 'b', data: { title: 'B', createdAt: at(3) } },
      { id: 'a', data: { title: 'A', createdAt: at(1) } },
    ];
    fb.byFilter['mentorshipIds'] = [{ id: 'c', data: { title: 'C', createdAt: at(2) } }];
    expect((await service.visible()).map((m) => m.id)).toEqual(['b', 'c', 'a']);
    expect(where).toHaveBeenCalledWith('published', '==', true);
    expect(where).toHaveBeenCalledWith('audience', '==', 'all');
    expect(where).toHaveBeenCalledWith('studentIds', 'array-contains', 'ana');
    expect(where).toHaveBeenCalledWith('mentorshipIds', 'array-contains-any', ['g1']);
  });

  it('skips the mentorship query for students without mentorships', async () => {
    profile.set({});
    await service.visible();
    expect(getDocs).toHaveBeenCalledTimes(2);
    profile.set({ mentorshipIds: ['g1'] });
  });

  it('shows staff every published piece, without drafts', async () => {
    isStaff.set(true);
    fb.all = [
      { id: 'a', data: { published: true, createdAt: at(1) } },
      { id: 'b', data: { published: false, createdAt: at(2) } },
    ];
    expect((await service.visible()).map((m) => m.id)).toEqual(['a']);
    expect((await service.all()).map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('reads one piece, or null when it is missing or not for this user', async () => {
    fb.one = { id: 'a', data: { title: 'A' } };
    expect(await service.get('a')).toEqual({ id: 'a', title: 'A' });
    fb.one = null;
    expect(await service.get('x')).toBeNull();
    fb.denied = true;
    expect(await service.get('a')).toBeNull();
  });

  it('creates, edits and deletes material', async () => {
    const input = {
      title: 'Gestión de riesgo',
      description: '',
      kind: 'video' as const,
      url: 'https://youtu.be/dQw4w9WgXcQ',
      category: 'Riesgo',
      audience: 'all' as const,
      studentIds: [],
      mentorshipIds: [],
      published: true,
    };
    expect(await service.create(input)).toBe('new-id');
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'materials/new-id' }), {
      ...input,
      createdBy: 'ana',
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    });
    await service.update('a', { published: false });
    expect(updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'materials/a' }), {
      published: false,
      updatedAt: 'SERVER_TIMESTAMP',
    });
    await service.remove('a');
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'materials/a' }));
  });
});
