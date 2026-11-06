import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { loadFeaturedReviews } from './featured-reviews';
import { ReviewService } from './review.service';

const fb = vi.hoisted(() => ({
  docs: {} as Record<string, { id: string; data: object }[]>,
}));

const at = (ms: number) => ({ toMillis: () => ms });

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path: string) => ({ path })),
  doc: vi.fn((parent: { path: string }, id: string) => ({ path: `${parent.path}/${id}`, id })),
  query: vi.fn((ref, ...constraints) => ({ ...ref, constraints })),
  where: vi.fn((...args) => ['where', ...args]),
  limit: vi.fn((n) => ['limit', n]),
  getDoc: vi.fn(async (ref: { path: string; id: string }) => {
    const found = Object.values(fb.docs)
      .flat()
      .find((d) => `reviews/${d.id}` === ref.path);
    return { id: ref.id, exists: () => !!found, data: () => found?.data };
  }),
  getDocs: vi.fn(async (ref: { path: string }) => ({
    docs: (fb.docs[ref.path] ?? []).map((d) => ({ id: d.id, data: () => d.data })),
  })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

import { deleteDoc, limit, setDoc, updateDoc, where } from 'firebase/firestore';

describe('ReviewService', () => {
  let service: ReviewService;
  const input = {
    name: '  Ana P. ',
    text: ' Me ayudó a operar con un plan claro. ',
    rating: 5,
    photoURL: null,
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
    service = TestBed.inject(ReviewService);
  });

  it("reads the student's own review, or null", async () => {
    expect(await service.mine('ana')).toBeNull();
    fb.docs['reviews'] = [{ id: 'ana', data: { name: 'Ana', rating: 4 } }];
    expect(await service.mine('ana')).toEqual({ id: 'ana', name: 'Ana', rating: 4 });
  });

  it('writes a new review off the landing, and edits take it off again', async () => {
    await service.save('ana', input, false);
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'reviews/ana', id: 'ana' },
      {
        name: 'Ana P.',
        text: 'Me ayudó a operar con un plan claro.',
        rating: 5,
        photoURL: null,
        featured: false,
        createdAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP',
      },
    );
    await service.save('ana', { ...input, rating: 3 }, true);
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'reviews/ana', id: 'ana' },
      expect.objectContaining({ rating: 3, featured: false, updatedAt: 'SERVER_TIMESTAMP' }),
    );
    expect(vi.mocked(updateDoc).mock.calls[0][1]).not.toHaveProperty('createdAt');
  });

  it('lists every review for admins, latest edit first, and picks or deletes them', async () => {
    fb.docs['reviews'] = [
      { id: 'a', data: { updatedAt: at(1) } },
      { id: 'b', data: { updatedAt: at(5) } },
    ];
    expect((await service.all()).map((r) => r.id)).toEqual(['b', 'a']);
    await service.setFeatured('a', true);
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'reviews/a', id: 'a' },
      { featured: true, featuredAt: 'SERVER_TIMESTAMP', featuredBy: 'boss' },
    );
    await service.remove('a');
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'reviews/a', id: 'a' });
  });

  it('loads only the picked reviews for the landing, latest picks first, 12 at most', async () => {
    fb.docs['reviews'] = Array.from({ length: 14 }, (_, i) => ({
      id: `r${i}`,
      data: { featured: true, featuredAt: at(i) },
    }));
    const shown = await loadFeaturedReviews({} as never);
    expect(where).toHaveBeenCalledWith('featured', '==', true);
    expect(limit).toHaveBeenCalledWith(50);
    expect(shown.length).toBe(12);
    expect(shown[0].id).toBe('r13');
  });
});
