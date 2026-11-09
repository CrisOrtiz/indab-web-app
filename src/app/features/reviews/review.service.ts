import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { LoadingService } from '../../core/loading/loading.service';
import { Review, ReviewInput, newestFirst } from '../../core/models/review';
import { clearFeaturedReviewsCache } from './featured-reviews-loader';

/**
 * Reviews of INDAB (`reviews/{uid}`): students write theirs from `/profile`, admins choose at
 * `/admin/reviews` which ones the landing shows (see `firestore.rules`). The landing reads the
 * chosen ones with `featured-reviews.ts`, which keeps the Firestore SDK out of public pages.
 */
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly loading = inject(LoadingService);

  private readonly reviews = collection(this.firestore, 'reviews');

  /** The student's own review, or null when they have not written one. */
  async mine(uid: string): Promise<Review | null> {
    const snapshot = await getDoc(doc(this.reviews, uid));
    return snapshot.exists() ? { ...(snapshot.data() as Review), id: snapshot.id } : null;
  }

  /**
   * Writes the student's review. Saving it again takes it off the landing (`featured` false)
   * until an admin picks it again.
   */
  save(uid: string, input: ReviewInput, existing: boolean): Promise<void> {
    const data = {
      name: input.name.trim(),
      photoURL: input.photoURL,
      rating: input.rating,
      text: input.text.trim(),
      featured: false,
      updatedAt: serverTimestamp(),
    };
    const ref = doc(this.reviews, uid);
    return existing ? updateDoc(ref, data) : setDoc(ref, { ...data, createdAt: serverTimestamp() });
  }

  remove(uid: string): Promise<void> {
    return deleteDoc(doc(this.reviews, uid));
  }

  /** Every review, latest written or edited first (admins). */
  async all(): Promise<Review[]> {
    const snapshot = await this.loading.track(getDocs(this.reviews));
    return newestFirst(
      snapshot.docs.map((d) => ({ ...(d.data() as Review), id: d.id })),
      'updatedAt',
    );
  }

  /** Shows the review on the landing, or takes it off (admins). */
  setFeatured(uid: string, featured: boolean): Promise<void> {
    clearFeaturedReviewsCache();
    return updateDoc(doc(this.reviews, uid), {
      featured,
      featuredAt: serverTimestamp(),
      featuredBy: this.auth.user()?.uid,
    });
  }
}
