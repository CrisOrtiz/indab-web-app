import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import {
  REVIEW_LIMITS,
  Review,
  ReviewInput,
  reviewProblem,
  shareablePhoto,
} from '../../core/models/review';
import { Stars } from '../../shared/stars/stars';
import { ReviewService } from './review.service';

type Status = { kind: 'error' | 'notice'; text: string };

/**
 * Part of `/profile` for students with academy access: their review of INDAB (stars, text, the
 * name to show and, if they want, their photo). Admins choose at `/admin/reviews` which ones
 * the landing shows; saving changes takes a review off the landing until it is picked again.
 */
@Component({
  selector: 'app-review-panel',
  imports: [Stars],
  templateUrl: './review-panel.html',
  styleUrls: ['../profile/profile.scss', './review-panel.scss'],
})
export class ReviewPanel {
  private readonly service = inject(ReviewService);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly limits = REVIEW_LIMITS;
  protected readonly ratings = [1, 2, 3, 4, 5];

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly status = signal<Status | null>(null);
  /** The review as saved, or null when there is none yet. */
  protected readonly saved = signal<Review | null>(null);

  protected readonly rating = signal(0);
  protected readonly name = signal('');
  protected readonly text = signal('');
  protected readonly withPhoto = signal(true);

  /** The profile photo that can go with the review, if any. */
  protected readonly photo = computed(() =>
    shareablePhoto(this.auth.profile()?.photoURL || this.auth.user()?.photoURL),
  );
  protected readonly length = computed(() => this.text().trim().length);

  constructor() {
    void this.load();
  }

  protected async save(): Promise<void> {
    const t = this.i18n.messages().reviews;
    const input: ReviewInput = {
      name: this.name(),
      text: this.text(),
      rating: this.rating(),
      photoURL: this.withPhoto() ? this.photo() : null,
    };
    const problem = reviewProblem(input);
    if (problem) {
      this.status.set({ kind: 'error', text: t.problems[problem] });
      return;
    }
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    this.saving.set(true);
    this.status.set(null);
    try {
      await this.service.save(uid, input, !!this.saved());
      this.saved.set(await this.service.mine(uid));
      this.status.set({ kind: 'notice', text: t.saved });
    } catch {
      this.status.set({ kind: 'error', text: t.failed });
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const t = this.i18n.messages().reviews;
    const uid = this.auth.user()?.uid;
    if (!uid || !confirm(t.confirmRemove)) {
      return;
    }
    this.saving.set(true);
    this.status.set(null);
    try {
      await this.service.remove(uid);
      this.saved.set(null);
      this.fill(null);
      this.status.set({ kind: 'notice', text: t.removed });
    } catch {
      this.status.set({ kind: 'error', text: t.failed });
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    await this.auth.whenReady();
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    try {
      const review = await this.service.mine(uid);
      this.saved.set(review);
      this.fill(review);
    } catch {
      this.loadFailed.set(true);
      this.fill(null);
    } finally {
      this.loading.set(false);
    }
  }

  /** Puts a saved review in the form, or starts a new one with the profile name. */
  private fill(review: Review | null): void {
    const profileName = this.auth.profile()?.displayName || this.auth.user()?.displayName || '';
    this.rating.set(review?.rating ?? 0);
    this.name.set(review?.name ?? profileName.slice(0, REVIEW_LIMITS.name));
    this.text.set(review?.text ?? '');
    this.withPhoto.set(review ? !!review.photoURL : true);
  }
}
