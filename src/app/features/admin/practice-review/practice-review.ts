import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Candle, PracticeSession, PracticeTrade } from '../../../core/models/practice';
import { HISTORY_BARS, MarketDataService, intervalMs } from '../../practice/market-data.service';
import { EXIT_REASONS, orderLabel, priceDigits } from '../../practice/practice-format';
import { PracticeService } from '../../practice/practice.service';
import { LOT_SIZE } from '../../practice/replay';
import { ReplayChart } from '../../practice/replay-chart';
import { SessionStatsPanel } from '../../practice/session-stats';

/**
 * Admin view of every student's chart-replay sessions: the trades logged in each, drawn on the
 * same candles the student practised on, and a way to delete a session.
 */
@Component({
  selector: 'app-practice-review',
  imports: [DatePipe, DecimalPipe, RouterLink, ReplayChart, SessionStatsPanel],
  templateUrl: './practice-review.html',
  styleUrls: ['../admin.scss', './practice-review.scss'],
})
export class PracticeReview {
  private readonly practice = inject(PracticeService);
  private readonly market = inject(MarketDataService);

  protected readonly exitReasons = EXIT_REASONS;
  protected readonly priceDigits = priceDigits;
  protected readonly orderLabel = orderLabel;
  protected readonly lotSize = LOT_SIZE;
  protected readonly statusLabels: Record<PracticeTrade['status'], string> = {
    pending: 'Orden pendiente',
    open: 'Abierta',
    closed: 'Cerrada',
    cancelled: 'Orden cancelada',
  };

  protected readonly sessions = signal<PracticeSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');

  /** Session whose trades are shown, and those trades once loaded. */
  protected readonly selected = signal<string | null>(null);
  protected readonly trades = signal<PracticeTrade[] | null>(null);
  /** Candles of the selected session; `null` while loading, `[]` when they could not load. */
  protected readonly candles = signal<Candle[] | null>(null);
  /** Bar length of those candles, so trade markers land on their bar. */
  protected readonly barSeconds = signal(0);
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
    this.candles.set(null);
    await Promise.all([this.loadTrades(session), this.loadCandles(session)]);
  }

  protected async remove(session: PracticeSession): Promise<void> {
    const when = session.startedAt?.toDate().toLocaleDateString('es') ?? '';
    if (
      !confirm(`¿Eliminar la práctica de ${session.userName} del ${when}? No se puede deshacer.`)
    ) {
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
      this.error.set('No se pudo eliminar la práctica.');
    } finally {
      this.deleting.set(null);
    }
  }

  private async loadTrades(session: PracticeSession): Promise<void> {
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

  /** Loads the replay window again: `HISTORY_BARS` of context before `replayStart`. */
  private async loadCandles(session: PracticeSession): Promise<void> {
    const ms = intervalMs(session.interval);
    try {
      if (!ms) {
        throw new Error(`Unknown interval ${session.interval}`);
      }
      const start = session.replayStart - HISTORY_BARS * ms;
      const candles = await this.market.loadCandles(session.symbol, session.interval, start);
      if (this.selected() === session.id) {
        this.barSeconds.set(ms / 1000);
        this.candles.set(candles);
      }
    } catch {
      if (this.selected() === session.id) {
        this.candles.set([]);
      }
    }
  }
}
