import { InjectionToken, inject } from '@angular/core';
import { FIRESTORE_LOADER } from '../../core/firebase/firebase.providers';
import type { Review } from '../../core/models/review';

/**
 * Reads the reviews picked for the landing. It loads the Firestore SDK and `featured-reviews.ts`
 * only when called, so public pages stay light until a visitor scrolls to the reviews. Specs
 * replace it with a fake.
 */
export const FEATURED_REVIEWS = new InjectionToken<() => Promise<Review[]>>('FEATURED_REVIEWS', {
  providedIn: 'root',
  factory: () => {
    const firestore = inject(FIRESTORE_LOADER);
    return async () => {
      const db = await firestore.load();
      const { loadFeaturedReviews } = await import('./featured-reviews');
      return loadFeaturedReviews(db);
    };
  },
});
