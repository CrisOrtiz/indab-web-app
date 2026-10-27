import { DecimalPipe } from '@angular/common';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { PracticeSession } from '../../core/models/practice';
import { EvaluationService } from '../evaluations/evaluation.service';
import { PracticeService } from './practice.service';
import { SessionReview } from './session-review';

/**
 * `/academy/practice/sessions/:id`: one practice session or evaluation attempt on its own page,
 * for its student or for staff. Notifications link here (a mentor's note, a student who
 * finished), so it opens straight on the review and its notes.
 */
@Component({
  selector: 'app-session-page',
  imports: [DecimalPipe, LocalDatePipe, RouterLink, SessionReview],
  template: `
    @let t = i18n.messages().sessionPage;
    @let tp = i18n.messages().practice;
    <section class="container">
      <a [routerLink]="auth.isStaff() ? '/admin/practice' : '/academy/practice'" class="back">{{
        auth.isStaff() ? t.backStaff : t.back
      }}</a>
      @if (loading()) {
        <p class="muted">{{ t.loading }}</p>
      } @else if (session(); as s) {
        <header class="page-header">
          <p class="eyebrow">{{ s.evaluationId ? t.evaluation : t.free }}</p>
          <h1>{{ title() || (auth.isStaff() ? s.userName : t.free) }}</h1>
          <p class="muted">
            @if (auth.isStaff()) {
              {{ s.userName }} ·
            }
            {{ s.startedAt?.toDate() | localDate: 'd MMM y, HH:mm' }} · {{ s.symbol }} ·
            {{ s.interval }} · {{ tp.trades }}: {{ s.tradeCount }} · P/L:
            <strong [class.up]="s.pnl > 0" [class.down]="s.pnl < 0">{{
              s.pnl | number: '1.2-2'
            }}</strong>
          </p>
        </header>
        <app-session-review [session]="s" [evaluationTitle]="title()" />
      } @else {
        <p class="muted">{{ t.notFound }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px 0 64px;
    }
    .back {
      display: inline-block;
      margin-bottom: 12px;
      color: var(--color-muted);
    }
    .page-header {
      margin-bottom: 16px;
    }
    .eyebrow {
      margin: 0;
      color: var(--color-muted);
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 4px 0;
      overflow-wrap: anywhere;
    }
    .muted {
      color: var(--color-muted);
    }
    .up {
      color: var(--color-up);
    }
    .down {
      color: var(--color-down);
    }
  `,
})
export class SessionPage {
  /** The session id, from the route. */
  readonly id = input.required<string>();

  private readonly practice = inject(PracticeService);
  private readonly evaluations = inject(EvaluationService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly session = signal<PracticeSession | null>(null);
  /** The evaluation's title, for an attempt. */
  protected readonly title = signal('');
  protected readonly loading = signal(true);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.title.set('');
    try {
      const session = await this.practice.getSession(id);
      this.session.set(session);
      if (session?.evaluationId) {
        const evaluation = await this.evaluations.get(session.evaluationId).catch(() => null);
        this.title.set(evaluation?.title ?? '');
      }
    } catch {
      this.session.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
