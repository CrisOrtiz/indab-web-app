import { InjectionToken, inject } from '@angular/core';
import { FIRESTORE_LOADER } from '../../core/firebase/firebase.providers';
import type { Review } from '../../core/models/review';

/** What the landing shows of a review; the timestamps stay out of the browser cache. */
export type LandingReview = Pick<Review, 'id' | 'name' | 'photoURL' | 'rating' | 'text'>;

/** Where this browser keeps the picked reviews, and for how long. */
export const FEATURED_REVIEWS_CACHE_KEY = 'indab.featuredReviews';
export const FEATURED_REVIEWS_CACHE_MS = 10 * 60_000;

interface CachedReviews {
  at: number;
  reviews: LandingReview[];
}

/** The reviews this browser read less than `FEATURED_REVIEWS_CACHE_MS` ago, if any. */
export function cachedFeaturedReviews(now = Date.now()): LandingReview[] | null {
  try {
    const raw = localStorage.getItem(FEATURED_REVIEWS_CACHE_KEY);
    const cached = raw ? (JSON.parse(raw) as CachedReviews) : null;
    return cached && Array.isArray(cached.reviews) && now - cached.at < FEATURED_REVIEWS_CACHE_MS
      ? cached.reviews
      : null;
  } catch {
    return null;
  }
}

/** Keeps the reviews in this browser (a full or blocked storage just skips it). */
export function cacheFeaturedReviews(reviews: LandingReview[], now = Date.now()): void {
  try {
    const cached: CachedReviews = {
      at: now,
      reviews: reviews.map(({ id, name, photoURL, rating, text }) => ({
        id,
        name,
        photoURL,
        rating,
        text,
      })),
    };
    localStorage.setItem(FEATURED_REVIEWS_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Nothing to do: the next visit reads them again.
  }
}

/** Forgets the cached reviews, so an admin who picks one sees the change at once. */
export function clearFeaturedReviewsCache(): void {
  try {
    localStorage.removeItem(FEATURED_REVIEWS_CACHE_KEY);
  } catch {
    // Storage blocked: there is no cache either.
  }
}

/**
 * Reads the reviews picked for the landing. It loads the Firestore SDK and `featured-reviews.ts`
 * only when called, so public pages stay light until a visitor scrolls to the reviews. A visitor
 * who comes back within ten minutes gets them from this browser, without reading Firestore (and
 * without downloading its SDK). Specs replace it with a fake.
 */
export const FEATURED_REVIEWS = new InjectionToken<() => Promise<LandingReview[]>>(
  'FEATURED_REVIEWS',
  {
    providedIn: 'root',
    factory: () => {
      const firestore = inject(FIRESTORE_LOADER);
      return async () => {
        const cached = cachedFeaturedReviews();
        if (cached) {
          return cached;
        }
        const db = await firestore.load();
        const { loadFeaturedReviews } = await import('./featured-reviews');
        const reviews = await loadFeaturedReviews(db);
        cacheFeaturedReviews(reviews);
        return reviews;
      };
    },
  },
);
