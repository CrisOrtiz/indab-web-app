import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { loadFeaturedReviews } from './featured-reviews';
import { cacheFeaturedReviews, cachedFeaturedReviews } from './featured-reviews-loader';
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
  orderBy: vi.fn((...args) => ['orderBy', ...args]),
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

import { deleteDoc, limit, orderBy, setDoc, updateDoc, where } from 'firebase/firestore';

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
    // The admin's own browser forgets the landing's cached picks, to see the change at once.
    cacheFeaturedReviews([]);
    await service.setFeatured('a', true);
    expect(cachedFeaturedReviews()).toBeNull();
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'reviews/a', id: 'a' },
      { featured: true, featuredAt: 'SERVER_TIMESTAMP', featuredBy: 'boss' },
    );
    await service.remove('a');
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'reviews/a', id: 'a' });
  });

  it('reads only the reviews the landing shows, latest picks first', async () => {
    // Firestore sorts and cuts the list: each document read counts against the daily quota.
    fb.docs['reviews'] = [
      { id: 'r2', data: { featured: true, featuredAt: at(2) } },
      { id: 'r1', data: { featured: true, featuredAt: at(1) } },
    ];
    const shown = await loadFeaturedReviews({} as never);
    expect(where).toHaveBeenCalledWith('featured', '==', true);
    expect(orderBy).toHaveBeenCalledWith('featuredAt', 'desc');
    expect(limit).toHaveBeenCalledWith(12);
    expect(shown.map((r) => r.id)).toEqual(['r2', 'r1']);
  });
});
