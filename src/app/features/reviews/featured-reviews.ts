import { Firestore, collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { LANDING_REVIEWS, Review } from '../../core/models/review';

/**
 * The reviews admins picked for the landing, latest picks first. The landing imports this file
 * dynamically, once the Firestore SDK is loaded, so the SDK stays out of the public bundle.
 * Only the ones the landing shows are read: every visitor pays these reads from the free daily
 * quota, and the rules refuse bigger lists.
 */
export async function loadFeaturedReviews(firestore: Firestore): Promise<Review[]> {
  const snapshot = await getDocs(
    query(
      collection(firestore, 'reviews'),
      where('featured', '==', true),
      orderBy('featuredAt', 'desc'),
      limit(LANDING_REVIEWS),
    ),
  );
  return snapshot.docs.map((d) => ({ ...(d.data() as Review), id: d.id }));
}
