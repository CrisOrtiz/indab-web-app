import { DecimalPipe, formatDate } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18n } from '../../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { Mentorship } from '../../../core/models/mentorship';
import { PracticeSession } from '../../../core/models/practice';
import { CursorPages } from '../../../shared/pager/cursor-pages';
import { Pager } from '../../../shared/pager/pager';
import { EvaluationService, StudentOption } from '../../evaluations/evaluation.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { PracticeService, SessionCursor, SessionFilters } from '../../practice/practice.service';
import { SessionFilterBar } from '../../practice/session-filters';
import { SessionReview } from '../../practice/session-review';

/** Sessions per page. */
export const REVIEW_PAGE_SIZE = 20;

/**
 * Trainer and admin view of every student's chart-replay sessions: each one opens a
 * `SessionReview` (its trades as position boxes on the candles the student practised on, and a
 * navigator through them), and admins can delete a session. The list is read a page at a time
 * with the filters applied in the query, so a long history never loads at once.
 */
@Component({
  selector: 'app-practice-review',
  imports: [DecimalPipe, LocalDatePipe, Pager, RouterLink, SessionFilterBar, SessionReview],
  templateUrl: './practice-review.html',
  styleUrls: ['../admin.scss', './practice-review.scss'],
})
export class PracticeReview {
  private readonly practice = inject(PracticeService);
  private readonly evaluations = inject(EvaluationService);
  private readonly mentorshipService = inject(MentorshipService);

  protected readonly i18n = inject(I18n);
  /** Trainers review; only admins delete. */
  protected readonly auth = inject(AuthService);

  /** `?student=uid` (from the mentor dashboard) opens the list filtered to that student. */
  protected readonly initialStudent =
    inject(ActivatedRoute).snapshot.queryParamMap.get('student') ?? '';
  private readonly filters = signal<SessionFilters>(
    this.initialStudent ? { uid: this.initialStudent } : {},
  );
  protected readonly filtered = computed(() => Object.keys(this.filters()).length > 0);
  protected readonly pages = new CursorPages<PracticeSession, SessionCursor>((after) =>
    this.practice.sessionsPage(this.filters(), REVIEW_PAGE_SIZE, after),
  );
  /** Sessions and trades matching the filters; null while counting or if it failed. */
  protected readonly totals = signal<{ sessions: number; trades: number } | null>(null);
  protected readonly students = signal<StudentOption[]>([]);
  protected readonly mentorships = signal<Mentorship[]>([]);
  protected readonly evaluationOptions = signal<{ id: string; title: string }[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Session opened for review. */
  protected readonly selected = signal<string | null>(null);
  /** Session being deleted. */
  protected readonly deleting = signal<string | null>(null);

  constructor() {
    void this.show(this.pages.first()).finally(() => this.loading.set(false));
    this.count();
    // The filter options are a convenience: the list works without them.
    this.evaluations
      .students()
      .then((students) => this.students.set(students))
      .catch(() => undefined);
    this.mentorshipService
      .all()
      .then((list) => this.mentorships.set(list))
      .catch(() => undefined);
    this.evaluations
      .all()
      .then((list) => this.evaluationOptions.set(list.map(({ id, title }) => ({ id, title }))))
      .catch(() => undefined);
  }

  protected filter(filters: SessionFilters): void {
    this.filters.set(filters);
    this.selected.set(null);
    void this.show(this.pages.first());
    this.count();
  }

  protected next(): void {
    this.selected.set(null);
    void this.show(this.pages.next());
  }

  protected previous(): void {
    this.selected.set(null);
    void this.show(this.pages.previous());
  }

  protected evaluationTitle(id: string | null | undefined): string {
    return this.evaluationOptions().find((e) => e.id === id)?.title ?? '';
  }

  protected toggle(session: PracticeSession): void {
    this.selected.set(this.selected() === session.id ? null : session.id);
  }

  protected async remove(session: PracticeSession): Promise<void> {
    const t = this.i18n.messages().review;
    const startedAt = session.startedAt?.toDate();
    const when = startedAt ? formatDate(startedAt, 'shortDate', this.i18n.language()) : '';
    if (!confirm(t.confirmDelete(session.userName, when))) {
      return;
    }
    this.error.set(null);
    this.deleting.set(session.id);
    try {
      await this.practice.deleteSession(session.id);
      this.pages.remove((s) => s.id === session.id);
      this.totals.update((totals) =>
        totals
          ? { sessions: totals.sessions - 1, trades: totals.trades - (session.tradeCount ?? 0) }
          : totals,
      );
      if (this.selected() === session.id) {
        this.selected.set(null);
      }
    } catch {
      this.error.set(t.deleteFailed);
    } finally {
      this.deleting.set(null);
    }
  }

  private async show(page: Promise<void>): Promise<void> {
    this.error.set(null);
    try {
      await page;
    } catch {
      this.error.set(this.i18n.messages().review.loadFailed);
    }
  }

  private count(): void {
    const filters = this.filters();
    this.totals.set(null);
    this.practice
      .sessionTotals(filters)
      .then((totals) => {
        if (filters === this.filters()) {
          this.totals.set(totals);
        }
      })
      .catch(() => undefined);
  }
}
