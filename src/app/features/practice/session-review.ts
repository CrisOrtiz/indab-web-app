import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { NoteTarget } from '../../core/models/mentor-note';
import { Candle, PracticeSession, PracticeTrade } from '../../core/models/practice';
import { MentorNotes } from '../notes/mentor-notes';
import { ChartSettingsService } from './chart-settings.service';
import { HISTORY_BARS, MarketDataService, intervalMs } from './market-data.service';
import { priceDigits } from './practice-format';
import { PracticeService } from './practice.service';
import { LOT_SIZE } from './replay';
import { ReplayChart } from './replay-chart';
import { SessionStatsPanel } from './session-stats';
import { filledTrades } from './trade-boxes';
import { TradeNavigator } from './trade-navigator';

/**
 * A finished (or abandoned) practice session to look back on, for staff and for the student:
 * its trades drawn as TradingView's position boxes on the candles it was practised on, a
 * navigator that steps through them, the mentors' notes, its statistics and the list of every
 * order.
 */
@Component({
  selector: 'app-session-review',
  imports: [
    DecimalPipe,
    LocalDatePipe,
    MentorNotes,
    ReplayChart,
    SessionStatsPanel,
    TradeNavigator,
  ],
  templateUrl: './session-review.html',
  styleUrl: './session-review.scss',
})
export class SessionReview {
  readonly session = input.required<PracticeSession>();
  /** The evaluation's title for an attempt, shown in the student's note notification. */
  readonly evaluationTitle = input('');

  private readonly practice = inject(PracticeService);
  private readonly market = inject(MarketDataService);
  /** The indicators the user keeps on the chart. */
  protected readonly chartSettings = inject(ChartSettingsService);

  protected readonly i18n = inject(I18n);
  protected readonly priceDigits = priceDigits;
  protected readonly lotSize = LOT_SIZE;

  /** The session's trades once loaded. */
  protected readonly trades = signal<PracticeTrade[] | null>(null);
  /** Its candles; `null` while loading, `[]` when they could not load. */
  protected readonly candles = signal<Candle[] | null>(null);
  /** Bar length of those candles, so trade boxes land on their bar. */
  protected readonly barSeconds = signal(0);
  protected readonly error = signal<string | null>(null);
  /** The trade the navigator and the chart show. */
  protected readonly selected = signal<string | null>(null);
  protected readonly filled = computed(() => filledTrades(this.trades() ?? []));
  /** Where the mentors' notes on this session go. */
  protected readonly noteTarget = computed<NoteTarget>(() => {
    const session = this.session();
    const evaluationId = session.evaluationId ?? null;
    return {
      studentId: session.uid,
      kind: evaluationId ? 'evaluation' : 'practice',
      targetId: session.id,
      contextId: evaluationId,
      title: evaluationId ? this.evaluationTitle() : '',
    };
  });

  constructor() {
    void this.chartSettings.load();
    effect(() => {
      const session = this.session();
      untracked(() => this.load(session));
    });
  }

  /** Picks a trade from the table; orders never filled have nothing to show on the chart. */
  protected pick(trade: PracticeTrade): void {
    if (trade.status === 'open' || trade.status === 'closed') {
      this.selected.set(trade.id);
    }
  }

  private load(session: PracticeSession): void {
    this.trades.set(null);
    this.candles.set(null);
    this.selected.set(null);
    this.error.set(null);
    this.loadTrades(session);
    this.loadCandles(session);
  }

  private async loadTrades(session: PracticeSession): Promise<void> {
    try {
      const trades = await this.practice.sessionTrades(session.id);
      if (this.session().id === session.id) {
        this.trades.set(trades);
        this.selected.set(filledTrades(trades)[0]?.id ?? null);
      }
    } catch {
      this.trades.set([]);
      this.error.set(this.i18n.messages().review.tradesFailed);
    }
  }

  /** Loads the replay window again: `HISTORY_BARS` of context before `replayStart` and the replay. */
  private async loadCandles(session: PracticeSession): Promise<void> {
    const ms = intervalMs(session.interval);
    try {
      if (!ms) {
        throw new Error(`Unknown interval ${session.interval}`);
      }
      const { symbol, interval, replayStart } = session;
      const [history, replay] = await Promise.all([
        this.market.loadHistory(symbol, interval, replayStart, HISTORY_BARS),
        this.market.loadCandles(symbol, interval, replayStart),
      ]);
      if (this.session().id === session.id) {
        this.barSeconds.set(ms / 1000);
        this.candles.set([...history, ...replay]);
      }
    } catch {
      if (this.session().id === session.id) {
        this.candles.set([]);
      }
    }
  }
}
