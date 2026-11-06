import type { Timestamp } from 'firebase/firestore';

/**
 * Stored at `reviews/{uid}`: a student's review of INDAB, written from `/profile` (one per
 * student, the document id is their uid). Admins pick at `/admin/reviews` which ones the
 * landing shows (`featured`); everyone can read those, the rest only the author and admins.
 * Editing a review takes it off the landing until an admin picks it again.
 */
export interface Review {
  /** The author's uid (the document id). */
  id: string;
  /** Name shown with the review, typed by the student (their profile name by default). */
  name: string;
  /** The author's profile photo when they chose to show it, else null. */
  photoURL: string | null;
  /** Stars, 1 to 5. */
  rating: number;
  text: string;
  /** Shown on the landing. Only admins set it to true. */
  featured: boolean;
  featuredAt?: Timestamp | null;
  featuredBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** What the student fills in. */
export type ReviewInput = Pick<Review, 'name' | 'photoURL' | 'rating' | 'text'>;

/** Limits, mirrored by `firestore.rules`. */
export const REVIEW_LIMITS = { name: 60, minText: 20, maxText: 600 } as const;

/** Most reviews the landing shows. */
export const LANDING_REVIEWS = 12;

/** The first problem with a review (a message key), or null when it can be saved. */
export function reviewProblem(
  input: ReviewInput,
): 'ratingRequired' | 'nameRequired' | 'textShort' | 'textLong' | null {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return 'ratingRequired';
  }
  if (!input.name.trim()) {
    return 'nameRequired';
  }
  const text = input.text.trim().length;
  if (text < REVIEW_LIMITS.minText) {
    return 'textShort';
  }
  if (text > REVIEW_LIMITS.maxText) {
    return 'textLong';
  }
  return null;
}

/** Only photos the rules accept travel with a review: our inline images and Google's. */
export function shareablePhoto(photo: string | null | undefined): string | null {
  if (!photo || photo.length > 100_000) {
    return null;
  }
  return /^data:image\/(jpeg|png|webp);base64,/.test(photo) ||
    /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(photo)
    ? photo
    : null;
}

/**
 * Newest first by `featuredAt` (the landing: latest picks first) or `updatedAt` (the admin
 * list: latest written or edited first).
 */
export function newestFirst(list: Review[], by: 'featuredAt' | 'updatedAt'): Review[] {
  const time = (r: Review) => r[by]?.toMillis?.() ?? 0;
  return [...list].sort((a, b) => time(b) - time(a));
}
