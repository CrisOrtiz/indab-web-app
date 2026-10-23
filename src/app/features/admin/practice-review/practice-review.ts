import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PracticeSession, PracticeTrade } from '../../../core/models/practice';
import { EXIT_REASONS, priceDigits } from '../../practice/practice-format';
import { PracticeService } from '../../practice/practice.service';

/** Admin view of every student's chart-replay sessions and the trades logged in each. */
@Component({
  selector: 'app-practice-review',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './practice-review.html',
  styleUrls: ['../admin.scss', './practice-review.scss'],
})
export class PracticeReview {
  private readonly practice = inject(PracticeService);

  protected readonly exitReasons = EXIT_REASONS;
  protected readonly priceDigits = priceDigits;

  protected readonly sessions = signal<PracticeSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');

  /** Session whose trades are shown, and those trades once loaded. */
  protected readonly selected = signal<string | null>(null);
  protected readonly trades = signal<PracticeTrade[] | null>(null);

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
      .catch(() =>
        this.error.set(
          'No se pudieron cargar las prácticas. Verifica que tu cuenta sea administradora.',
        ),
      )
      .finally(() => this.loading.set(false));
  }

  protected async toggle(session: PracticeSession): Promise<void> {
    if (this.selected() === session.id) {
      this.selected.set(null);
      return;
    }
    this.selected.set(session.id);
    this.trades.set(null);
    try {
      const trades = await this.practice.sessionTrades(session.id);
      if (this.selected() === session.id) {
        this.trades.set(trades);
      }
    } catch {
      this.trades.set([]);
      this.error.set('No se pudieron cargar las operaciones de la sesión.');
    }
  }
}
