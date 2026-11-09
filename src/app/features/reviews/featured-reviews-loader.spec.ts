import { TestBed } from '@angular/core/testing';
import { FIRESTORE_LOADER } from '../../core/firebase/firebase.providers';
import {
  FEATURED_REVIEWS,
  FEATURED_REVIEWS_CACHE_KEY,
  FEATURED_REVIEWS_CACHE_MS,
  LandingReview,
  cacheFeaturedReviews,
  cachedFeaturedReviews,
  clearFeaturedReviewsCache,
} from './featured-reviews-loader';

const review: LandingReview = {
  id: 'ana',
  name: 'Ana P.',
  photoURL: null,
  rating: 5,
  text: 'La mentoría me ayudó a operar con un plan claro.',
};

describe('featured reviews cache', () => {
  beforeEach(() => localStorage.clear());

  it('keeps only what the landing shows, for ten minutes', () => {
    cacheFeaturedReviews([{ ...review, featured: true } as LandingReview], 1000);
    expect(cachedFeaturedReviews(1000)).toEqual([review]);
    expect(cachedFeaturedReviews(1000 + FEATURED_REVIEWS_CACHE_MS - 1)).toEqual([review]);
    expect(cachedFeaturedReviews(1000 + FEATURED_REVIEWS_CACHE_MS)).toBeNull();
  });

  it('ignores broken data and can be cleared', () => {
    localStorage.setItem(FEATURED_REVIEWS_CACHE_KEY, '{not json');
    expect(cachedFeaturedReviews()).toBeNull();
    cacheFeaturedReviews([review]);
    clearFeaturedReviewsCache();
    expect(cachedFeaturedReviews()).toBeNull();
  });

  it('skips Firestore while the cache is fresh', async () => {
    const load = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: FIRESTORE_LOADER, useValue: { load, instance: () => null } }],
    });
    cacheFeaturedReviews([review]);
    expect(await TestBed.inject(FEATURED_REVIEWS)()).toEqual([review]);
    expect(load).not.toHaveBeenCalled();
  });
});
