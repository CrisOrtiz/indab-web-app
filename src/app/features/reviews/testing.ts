import { Provider } from '@angular/core';
import { Review } from '../../core/models/review';
import { ReviewService } from './review.service';

/**
 * For specs of pages that show the review panel (`/profile`): a review service that reads
 * nothing (or `mine`) and writes nothing. Wrap a method in `vi.fn` to check a call.
 */
export function quietReviews(mine: Review | null = null) {
  const reviews = {
    mine: async (..._args: unknown[]) => mine,
    save: async (..._args: unknown[]) => undefined,
    remove: async (..._args: unknown[]) => undefined,
    all: async (..._args: unknown[]) => [] as Review[],
    setFeatured: async (..._args: unknown[]) => undefined,
  };
  const providers: Provider[] = [{ provide: ReviewService, useValue: reviews }];
  return { reviews, providers };
}
