import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PracticeSession, PracticeTrade, TradeSide } from '../../core/models/practice';
import {
  HISTORY_BARS,
  INSTRUMENTS,
  MarketDataService,
  TIMEFRAMES,
  randomWindowStart,
} from './market-data.service';
import { EXIT_REASONS, priceDigits } from './practice-format';
import { PracticeService } from './practice.service';
import { Replay, STARTING_BALANCE, tradePnl } from './replay';
import { ReplayChart } from './replay-chart';

type Phase = 'setup' | 'loading' | 'playing' | 'finished';

export const SPEEDS = [1, 2, 5, 10];

/** Fewer replay candles than this means the window hit the end of the data: try another. */
const MIN_REPLAY_BARS = 50;

/**
 * Chart-replay trading practice: the student picks a market, gets a random stretch of real
 * history with the future hidden, steps through it bar by bar and opens simulated trades.
 * Every session and trade is logged to Firestore for instructors to review.
 */
@Component({
  selector: 'app-practice',
  imports: [RouterLink, DatePipe, DecimalPipe, PercentPipe, ReplayChart],
  templateUrl: './practice.html',
  styleUrl: './practice.scss',
  host: { '(window:keydown)': 'onKey($event)' },
})
export class Practice {
  private readonly auth = inject(AuthService);
  private readonly market = inject(MarketDataService);
  private readonly practice = inject(PracticeService);

  protected readonly instruments = INSTRUMENTS;
  protected readonly timeframes = TIMEFRAMES;
  protected readonly speeds = SPEEDS;
  protected readonly exitReasons = EXIT_REASONS;
  protected readonly startingBalance = STARTING_BALANCE;
  protected readonly priceDigits = priceDigits;

  // Setup
  protected readonly symbol = signal(INSTRUMENTS[0].symbol);
  protected readonly interval = signal(TIMEFRAMES[1].interval);
  protected readonly hideDates = signal(true);

  // Session
  protected readonly phase = signal<Phase>('setup');
  protected readonly replay = signal<Replay | null>(null);
  protected readonly sessionId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly playing = signal(false);
  protected readonly speed = signal(SPEEDS[1]);
  protected readonly history = signal<PracticeSession[]>([]);

  // Order ticket
  protected readonly side = signal<TradeSide>('long');
  protected readonly amount = signal(1000);
  protected readonly stopLoss = signal<number | null>(null);
  protected readonly takeProfit = signal<number | null>(null);
  protected readonly orderError = signal<string | null>(null);
  protected readonly placing = signal(false);

  protected readonly instrumentLabel = computed(
    () => INSTRUMENTS.find((i) => i.symbol === this.symbol())?.label ?? this.symbol(),
  );
  protected readonly visibleCandles = computed(() => {
    const replay = this.replay();
    return replay ? replay.candles.slice(0, replay.cursor() + 1) : [];
  });
  /** Dates come back once the replay is over. */
  protected readonly datesHidden = computed(() => this.hideDates() && this.phase() === 'playing');
  protected readonly closedTrades = computed(() =>
    [...(this.replay()?.closedTrades() ?? [])].reverse(),
  );

  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    this.loadHistory();
    inject(DestroyRef).onDestroy(() => {
      this.pause();
      // Leaving mid-replay ends the session, so open trades are not left dangling.
      if (this.phase() === 'playing') {
        void this.finish();
      }
    });
  }

  protected async start(): Promise<void> {
    const instrument = INSTRUMENTS.find((i) => i.symbol === this.symbol())!;
    const timeframe = TIMEFRAMES.find((t) => t.interval === this.interval())!;
    const user = this.auth.user();
    if (!user) {
      return;
    }
    this.error.set(null);
    this.phase.set('loading');
    try {
      const candles = await this.market.loadCandles(
        instrument.symbol,
        timeframe.interval,
        randomWindowStart(instrument, timeframe),
      );
      if (candles.length < HISTORY_BARS + MIN_REPLAY_BARS) {
        throw new Error('Not enough data');
      }
      const replay = new Replay(candles, HISTORY_BARS);
      const sessionId = await this.practice.startSession({
        uid: user.uid,
        userName: this.auth.profile()?.displayName || user.email || user.uid,
        symbol: instrument.symbol,
        interval: timeframe.interval,
        replayStart: candles[HISTORY_BARS].time * 1000,
        startingBalance: replay.startingBalance,
      });
      this.replay.set(replay);
      this.sessionId.set(sessionId);
      this.orderError.set(null);
      this.stopLoss.set(null);
      this.takeProfit.set(null);
      this.phase.set('playing');
    } catch {
      this.error.set(
        'No se pudieron cargar los datos del mercado o iniciar la sesión. Intenta de nuevo.',
      );
      this.phase.set('setup');
    }
  }

  /** Shows the next candle; ends the session after the last one. */
  protected step(): void {
    const replay = this.replay();
    if (!replay || this.phase() !== 'playing') {
      return;
    }
    const result = replay.step();
    result?.closed.forEach((trade) => this.persistClose(trade));
    if (replay.finished()) {
      void this.finish();
    }
  }

  protected togglePlay(): void {
    if (this.playing()) {
      this.pause();
    } else {
      this.play();
    }
  }

  protected setSpeed(speed: number): void {
    this.speed.set(speed);
    if (this.playing()) {
      this.pause();
      this.play();
    }
  }

  protected async openTrade(): Promise<void> {
    const replay = this.replay();
    const sessionId = this.sessionId();
    const uid = this.auth.user()?.uid;
    if (!replay || !sessionId || !uid) {
      return;
    }
    let trade: PracticeTrade;
    try {
      trade = replay.open(this.practice.newTradeId(sessionId), {
        side: this.side(),
        amount: this.amount(),
        stopLoss: this.stopLoss(),
        takeProfit: this.takeProfit(),
      });
    } catch (e) {
      this.orderError.set((e as Error).message);
      return;
    }
    this.orderError.set(null);
    this.placing.set(true);
    try {
      await this.practice.openTrade(sessionId, uid, trade);
      this.stopLoss.set(null);
      this.takeProfit.set(null);
    } catch {
      replay.discard(trade.id);
      this.orderError.set('No se pudo registrar la operación. Intenta de nuevo.');
    } finally {
      this.placing.set(false);
    }
  }

  protected closeTrade(trade: PracticeTrade): void {
    const replay = this.replay();
    if (replay) {
      this.persistClose(replay.close(trade.id));
    }
  }

  /** Closes every open trade at the current price and marks the session finished. */
  protected async finish(): Promise<void> {
    const replay = this.replay();
    const sessionId = this.sessionId();
    if (!replay || !sessionId || this.phase() !== 'playing') {
      return;
    }
    this.pause();
    this.phase.set('finished');
    const closed = replay.closeAll('sessionEnd');
    try {
      await Promise.all(closed.map((trade) => this.practice.closeTrade(sessionId, trade)));
      await this.practice.finishSession(sessionId, this.summary(replay));
    } catch {
      this.error.set('No se pudo guardar el cierre de la sesión.');
    }
    this.loadHistory();
  }

  protected reset(): void {
    this.replay.set(null);
    this.sessionId.set(null);
    this.error.set(null);
    this.phase.set('setup');
  }

  protected numberOrNull(value: string): number | null {
    return value === '' ? null : Number(value);
  }

  protected openPnl(replay: Replay, trade: PracticeTrade): number {
    return tradePnl(trade, replay.current().close);
  }

  protected tradeAmount(trade: PracticeTrade): number {
    return trade.quantity * trade.entryPrice;
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target;
    const typing = target instanceof Element && target.closest('input, select, textarea');
    if (event.key === 'ArrowRight' && !typing) {
      event.preventDefault();
      this.step();
    }
  }

  private play(): void {
    this.playing.set(true);
    this.timer = setInterval(() => this.step(), 1000 / this.speed());
  }

  private pause(): void {
    this.playing.set(false);
    clearInterval(this.timer);
  }

  private persistClose(trade: PracticeTrade): void {
    const replay = this.replay();
    const sessionId = this.sessionId();
    if (!replay || !sessionId) {
      return;
    }
    Promise.all([
      this.practice.closeTrade(sessionId, trade),
      this.practice.updateSummary(sessionId, this.summary(replay)),
    ]).catch(() => this.error.set('No se pudo registrar el cierre de una operación.'));
  }

  private summary(replay: Replay) {
    return {
      balance: replay.balance(),
      pnl: replay.realized(),
      tradeCount: replay.trades().length,
    };
  }

  private loadHistory(): void {
    const uid = this.auth.user()?.uid;
    if (uid) {
      this.practice
        .mySessions(uid)
        .then((sessions) => this.history.set(sessions))
        .catch(() => this.history.set([]));
    }
  }
}
