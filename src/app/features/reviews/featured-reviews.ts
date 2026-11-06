import { Firestore, collection, getDocs, limit, query, where } from 'firebase/firestore';
import { LANDING_REVIEWS, Review, newestFirst } from '../../core/models/review';

/**
 * The reviews admins picked for the landing, latest picks first. The landing imports this file
 * dynamically, once the Firestore SDK is loaded, so the SDK stays out of the public bundle.
 */
export async function loadFeaturedReviews(firestore: Firestore): Promise<Review[]> {
  const snapshot = await getDocs(
    query(collection(firestore, 'reviews'), where('featured', '==', true), limit(50)),
  );
  return newestFirst(
    snapshot.docs.map((d) => ({ ...(d.data() as Review), id: d.id })),
    'featuredAt',
  ).slice(0, LANDING_REVIEWS);
}
