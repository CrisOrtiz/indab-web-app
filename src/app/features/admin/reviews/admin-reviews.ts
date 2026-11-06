import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { LANDING_REVIEWS, Review } from '../../../core/models/review';
import { ActionsMenu, MenuAction } from '../../../shared/actions-menu/actions-menu';
import { Avatar } from '../../../shared/avatar/avatar';
import { Icon } from '../../../shared/icon/icon';
import { Stars } from '../../../shared/stars/stars';
import { EvaluationService } from '../../evaluations/evaluation.service';
import { ReviewService } from '../../reviews/review.service';

export type ReviewFilter = '' | 'shown' | 'hidden';

/** Reviews matching the filter and the search (name, text or the author's email). */
export function filterReviews(
  list: Review[],
  filter: ReviewFilter,
  search: string,
  emails: ReadonlyMap<string, string> = new Map(),
): Review[] {
  const term = search.trim().toLowerCase();
  return list.filter(
    (r) =>
      (!filter || r.featured === (filter === 'shown')) &&
      (!term ||
        r.name.toLowerCase().includes(term) ||
        r.text.toLowerCase().includes(term) ||
        (emails.get(r.id) ?? '').toLowerCase().includes(term)),
  );
}

/**
 * `/admin/reviews` (admins): the students' reviews of INDAB, written in `/profile`. The admin
 * picks which ones the landing shows (the latest `LANDING_REVIEWS` picks) and can delete any.
 */
@Component({
  selector: 'app-admin-reviews',
  imports: [ActionsMenu, Avatar, Icon, LocalDatePipe, RouterLink, Stars],
  templateUrl: './admin-reviews.html',
  styleUrls: [
    '../admin.scss',
    '../evaluations/admin-evaluations.scss',
    '../../../shared/pager/_list-filters.scss',
    './admin-reviews.scss',
  ],
})
export class AdminReviews {
  private readonly service = inject(ReviewService);
  private readonly directory = inject(EvaluationService);
  protected readonly i18n = inject(I18n);

  protected readonly landingMax = LANDING_REVIEWS;
  protected readonly reviews = signal<Review[]>([]);
  /** Author emails by uid, so admins know who wrote each review. */
  protected readonly emails = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly loading = signal(true);
  protected readonly busy = signal<string | null>(null);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  protected readonly filter = signal<ReviewFilter>('');
  protected readonly search = signal('');
  protected readonly visible = computed(() =>
    filterReviews(this.reviews(), this.filter(), this.search(), this.emails()),
  );

  protected readonly stats = computed(() => {
    const list = this.reviews();
    const total = list.reduce((sum, r) => sum + r.rating, 0);
    return {
      total: list.length,
      shown: list.filter((r) => r.featured).length,
      average: list.length ? (total / list.length).toFixed(1) : '—',
    };
  });

  /** The card menu; showing or hiding a review is the card's own button. */
  protected readonly menu = computed((): MenuAction[] => [
    { id: 'delete', label: this.i18n.messages().reviews.delete, icon: 'trash', danger: true },
  ]);

  constructor() {
    void this.load();
  }

  protected act(review: Review, action: string): void {
    if (action === 'delete') {
      void this.remove(review);
    }
  }

  protected async setFeatured(review: Review, featured: boolean): Promise<void> {
    const t = this.i18n.messages().reviews;
    await this.run(review, async () => {
      await this.service.setFeatured(review.id, featured);
      this.reviews.update((list) => list.map((r) => (r.id === review.id ? { ...r, featured } : r)));
      return featured ? t.featuredMsg(review.name) : t.unfeaturedMsg(review.name);
    });
  }

  private async remove(review: Review): Promise<void> {
    const t = this.i18n.messages().reviews;
    if (!confirm(t.confirmDelete(review.name))) {
      return;
    }
    await this.run(review, async () => {
      await this.service.remove(review.id);
      this.reviews.update((list) => list.filter((r) => r.id !== review.id));
      return t.deleted;
    });
  }

  private async run(review: Review, action: () => Promise<string>): Promise<void> {
    this.busy.set(review.id);
    this.message.set(null);
    try {
      this.message.set({ kind: 'ok', text: await action() });
    } catch {
      this.message.set({ kind: 'error', text: this.i18n.messages().reviews.actionFailed });
    } finally {
      this.busy.set(null);
    }
  }

  private async load(): Promise<void> {
    try {
      this.reviews.set(await this.service.all());
    } catch {
      this.message.set({ kind: 'error', text: this.i18n.messages().reviews.adminLoadFailed });
    } finally {
      this.loading.set(false);
    }
    // Emails are a help, not needed to pick reviews.
    this.directory
      .students()
      .then((students) => this.emails.set(new Map(students.map((s) => [s.uid, s.email]))))
      .catch(() => undefined);
  }
}
