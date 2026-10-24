import { DecimalPipe, formatDate } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18n } from '../../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { PracticeSession } from '../../../core/models/practice';
import { PracticeService } from '../../practice/practice.service';
import { SessionReview } from '../../practice/session-review';

/**
 * Trainer and admin view of every student's chart-replay sessions: each one opens a
 * `SessionReview` (its trades as position boxes on the candles the student practised on, and a
 * navigator through them), and admins can delete a session.
 */
@Component({
  selector: 'app-practice-review',
  imports: [DecimalPipe, LocalDatePipe, RouterLink, SessionReview],
  templateUrl: './practice-review.html',
  styleUrls: ['../admin.scss', './practice-review.scss'],
})
export class PracticeReview {
  private readonly practice = inject(PracticeService);

  protected readonly i18n = inject(I18n);
  /** Trainers review; only admins delete. */
  protected readonly auth = inject(AuthService);

  protected readonly sessions = signal<PracticeSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');

  /** Session opened for review. */
  protected readonly selected = signal<string | null>(null);
  /** Session being deleted. */
  protected readonly deleting = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    return term
      ? this.sessions().filter((s) => `${s.userName} ${s.symbol}`.toLowerCase().includes(term))
      : this.sessions();
  });
  protected readonly stats = computed(() => {
    const sessions = this.sessions();
    return {
      sessions: sessions.length,
      students: new Set(sessions.map((s) => s.uid)).size,
      trades: sessions.reduce((sum, s) => sum + (s.tradeCount ?? 0), 0),
    };
  });

  constructor() {
    this.practice
      .allSessions()
      .then((sessions) => this.sessions.set(sessions))
      .catch(() => this.error.set(this.i18n.messages().review.loadFailed))
      .finally(() => this.loading.set(false));
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
      this.sessions.update((list) => list.filter((s) => s.id !== session.id));
      if (this.selected() === session.id) {
        this.selected.set(null);
      }
    } catch {
      this.error.set(t.deleteFailed);
    } finally {
      this.deleting.set(null);
    }
  }
}
