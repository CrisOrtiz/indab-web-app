import { DecimalPipe, PercentPipe, formatNumber } from '@angular/common';
import { Component, DestroyRef, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { Evaluation, EvaluationWindow, evaluationWindow } from '../../core/models/evaluation';
import {
  Candle,
  OrderType,
  PracticeSession,
  PracticeTrade,
  TradeSide,
} from '../../core/models/practice';
import { EvaluationService } from '../evaluations/evaluation.service';
import { BarBuilder, formatElapsed, nextBarEnd } from './bars';
import {
  DEFAULT_TIMEFRAME,
  HISTORY_BARS,
  INSTRUMENTS,
  MINUTE,
  MarketDataService,
  REPLAY_BARS,
  REPLAY_DAYS,
  TIMEFRAMES,
  Timeframe,
  findInstrument,
  randomReplayStart,
  replayStartAt,
  replayWindow,
} from './market-data.service';
import { formatLots, priceDigits, roundPrice, signedMoney } from './practice-format';
import { CursorPages } from '../../shared/pager/cursor-pages';
import { Pager } from '../../shared/pager/pager';
import { NotificationService } from '../notifications/notification.service';
import { PracticeService, SessionCursor, SessionFilters } from './practice.service';
import {
  LEVERAGE,
  LOT_SIZE,
  LOT_STEP,
  OpenTradeInput,
  Replay,
  STARTING_BALANCE,
  TradeLevels,
  fillsBelow,
  marginFor,
  tradeLots,
  tradePnl,
  validateOrder,
} from './replay';
import { LevelMove, LevelRemove, OrderAt, OrderDraft, ReplayChart } from './replay-chart';
import { SessionFilterBar } from './session-filters';
import { SessionReview } from './session-review';
import { SessionStatsPanel } from './session-stats';
import { filledTrades } from './trade-boxes';
import { TradeNavigator } from './trade-navigator';

type Phase = 'setup' | 'loading' | 'playing' | 'finished';
type Tab = 'positions' | 'orders' | 'history' | 'stats';
type LevelField = 'stopLoss' | 'takeProfit';

export const SPEEDS = [1, 2, 5, 10];

// Where new levels start, as a fraction of the reference price; students then drag them.
const DEFAULT_ORDER_OFFSET = 0.005;
const DEFAULT_STOP_OFFSET = 0.01;
const DEFAULT_TARGET_OFFSET = 0.02;

/** Fewer one-minute candles than this means the window hit the end of the data. */
const MIN_REPLAY_MINUTES = 60;
/** Fetch the next chunk of minutes when fewer than this are left to replay. */
const PREFETCH_MINUTES = 600;
/** How long a refused one-click order says why on the chart. */
export const QUICK_ERROR_MS = 6000;

/** An evaluation assigned to the student, with their attempt if they took it. */
export interface EvaluationCard {
  evaluation: Evaluation;
  window: EvaluationWindow;
  attempt: PracticeSession | null;
}

/** Remaining time as m:ss, or h:mm:ss from an hour up. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Chart-replay trading practice: the student picks a market, gets a random stretch of real
 * history with the future hidden, steps through it bar by bar and opens simulated trades.
 * Every session and trade is logged to Firestore for instructors to review.
 *
 * Free practice can be started at any time. Evaluations set up by a trainer are listed above
 * the setup: each one is taken once, inside its window, on the evaluation's market and replay
 * start, and ends by itself when its time limit runs out.
 *
 * The trading screen follows TradingView: Buy/Sell prices on the chart for one-click market
 * orders, an order panel with Market/Limit/Stop tabs and take profit / stop loss checkboxes
 * that show their P/L, and Positions / Orders / History tabs under the chart. The order being
 * set up only shows on the chart once the student adds it from the chart's "+" menu or starts
 * filling in the panel; it is placed with its Buy/Sell button and discarded with its ×.
 */
/** Past sessions per page. */
export const SESSIONS_PAGE_SIZE = 10;

@Component({
  selector: 'app-practice',
  imports: [
    RouterLink,
    LocalDatePipe,
    DecimalPipe,
    PercentPipe,
    Pager,
    ReplayChart,
    SessionFilterBar,
    SessionReview,
    SessionStatsPanel,
    TradeNavigator,
  ],
  templateUrl: './practice.html',
  styleUrls: ['./practice.scss', './trading-panel.scss', './trading-account.scss'],
  host: { '(window:keydown)': 'onKey($event)' },
})
export class Practice {
  private readonly auth = inject(AuthService);
  private readonly market = inject(MarketDataService);
  private readonly practice = inject(PracticeService);
  private readonly notifications = inject(NotificationService);
  private readonly evaluationService = inject(EvaluationService);
  private readonly locale = inject(LOCALE_ID);
  protected readonly i18n = inject(I18n);

  protected readonly instruments = INSTRUMENTS;
  protected readonly timeframes = TIMEFRAMES;
  protected readonly speeds = SPEEDS;
  protected readonly startingBalance = STARTING_BALANCE;
  protected readonly priceDigits = priceDigits;
  protected readonly orderTypes: OrderType[] = ['market', 'limit', 'stop'];
  protected readonly signed = signedMoney;
  protected readonly leverage = LEVERAGE;
  protected readonly lotSize = LOT_SIZE;
  protected readonly lotStep = LOT_STEP;
  protected readonly formatLots = formatLots;
  protected readonly tradeLots = tradeLots;
  /** Size shortcuts, as parts of the largest order the free margin allows. */
  protected readonly fractions = [0.25, 0.5, 1];
  /** Stop loss and take profit, in the order of the position columns. */
  protected readonly levels: { field: LevelField; short: string }[] = [
    { field: 'stopLoss', short: 'SL' },
    { field: 'takeProfit', short: 'TP' },
  ];
  /** The order panel lists the take profit above the stop loss, as TradingView does. */
  protected readonly ticketLevels = [...this.levels].reverse();

  // Setup
  protected readonly symbol = signal(INSTRUMENTS[0].symbol);
  protected readonly hideDates = signal(true);
  /** Replay start the student picked (yyyy-mm-dd, UTC), or '' for a random one. */
  protected readonly startDate = signal('');
  protected readonly randomStart = signal(true);
  /** Dates the student can pick a replay start from. */
  protected readonly dateRange = computed(() => {
    const { earliest, latest } = replayWindow(this.instrument());
    const day = (time: number) => new Date(time).toISOString().slice(0, 10);
    return { min: day(earliest), max: day(latest) };
  });

  // Session
  protected readonly phase = signal<Phase>('setup');
  protected readonly replay = signal<Replay | null>(null);
  protected readonly sessionId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly playing = signal(false);
  protected readonly speed = signal(SPEEDS[1]);
  /** The student's past sessions, a page at a time, with the filters picked. */
  protected readonly history = new CursorPages<PracticeSession, SessionCursor>((after) =>
    this.practice.sessionsPage(
      { ...this.historyFilters(), uid: this.auth.user()?.uid },
      SESSIONS_PAGE_SIZE,
      after,
    ),
  );
  protected readonly historyFilters = signal<SessionFilters>({});
  protected readonly historyFiltered = computed(
    () => Object.keys(this.historyFilters()).length > 0,
  );
  protected readonly historyFailed = signal(false);
  /** Evaluations the student has taken, to filter the sessions by. */
  protected readonly takenEvaluations = computed(() =>
    this.evaluations()
      .filter((card) => card.attempt)
      .map(({ evaluation }) => ({ id: evaluation.id, title: evaluation.title })),
  );
  /** Past session opened for review below its row. */
  protected readonly reviewing = signal<string | null>(null);
  /** Trade of the finished session that the navigator and the chart show. */
  protected readonly focused = signal<string | null>(null);
  protected readonly filledTrades = computed(() => filledTrades(this.replay()?.trades() ?? []));
  /** The student's assigned evaluations. */
  protected readonly evaluations = signal<EvaluationCard[]>([]);
  /** The evaluation being taken, if this session is an attempt. */
  protected readonly evaluation = signal<Evaluation | null>(null);
  /** When the attempt's time runs out (ms), by this device's clock. */
  protected readonly deadline = signal<number | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly remaining = computed(() => {
    const deadline = this.deadline();
    return deadline === null ? null : formatCountdown(deadline - this.now());
  });
  protected readonly tab = signal<Tab>('positions');
  /** Timeframe on the chart; the replay itself moves minute by minute. */
  protected readonly timeframe = signal<Timeframe>(DEFAULT_TIMEFRAME);
  /** Timeframe whose history is loading. */
  protected readonly switching = signal<string | null>(null);
  protected readonly replayStart = signal(0);
  /** Bars before the replay start, per timeframe, fetched when first shown. */
  private readonly histories = signal<Record<string, Candle[]>>({});
  private builders = new Map<string, BarBuilder>();
  private loadingMinutes = false;

  // Order ticket
  protected readonly side = signal<TradeSide>('long');
  protected readonly orderType = signal<OrderType>('market');
  /** Limit or stop price. */
  protected readonly orderPrice = signal<number | null>(null);
  /** Size in lots. */
  protected readonly lots = signal(LOT_STEP);
  protected readonly stopLoss = signal<number | null>(null);
  protected readonly takeProfit = signal<number | null>(null);
  protected readonly orderError = signal<string | null>(null);
  /** Why the chart's one-click Buy/Sell was refused, shown under its buttons for a while. */
  protected readonly quickError = signal<string | null>(null);
  protected readonly placing = signal(false);
  /** Whether the order being set up is on the chart. */
  protected readonly drafting = signal(false);

  protected readonly instrument = computed(() => findInstrument(this.symbol()) ?? INSTRUMENTS[0]);
  protected readonly instrumentLabel = computed(
    () => this.i18n.messages().trading.instruments[this.symbol()] ?? this.instrument().label,
  );
  /** The history bars plus the replayed minutes built into bars of the chart's timeframe. */
  protected readonly visibleCandles = computed(() => {
    const replay = this.replay();
    if (!replay) {
      return [];
    }
    const { interval, ms } = this.timeframe();
    let builder = this.builders.get(interval);
    if (!builder) {
      builder = new BarBuilder(ms / 1000, replay.historyBars);
      this.builders.set(interval, builder);
    }
    return [
      ...(this.histories()[interval] ?? []),
      ...builder.build(replay.candles, replay.cursor()),
    ];
  });
  protected readonly barSeconds = computed(() => this.timeframe().ms / 1000);
  /** Market time replayed so far. */
  protected readonly elapsed = computed(() => {
    const replay = this.replay();
    return replay ? formatElapsed(replay.current().time + 60 - this.replayStart() / 1000) : '';
  });
  /** Dates come back once the replay is over. */
  protected readonly datesHidden = computed(() => this.hideDates() && this.phase() === 'playing');
  protected readonly closedTrades = computed(() =>
    [...(this.replay()?.closedTrades() ?? [])].reverse(),
  );

  /** Where the ticket's order would enter: the market, or its limit/stop price. */
  protected readonly reference = computed(() => {
    const current = this.replay()?.current().close ?? 0;
    return this.orderType() === 'market' ? current : (this.orderPrice() ?? current);
  });
  /** Units (ounces) of the ticket's order. */
  protected readonly units = computed(() => this.lots() * LOT_SIZE);
  protected readonly margin = computed(() => marginFor(this.lots(), this.reference()));
  /** Reward per unit of risk, once the ticket has both a stop loss and a take profit. */
  protected readonly riskReward = computed(() => {
    const stopLoss = this.stopLoss();
    const takeProfit = this.takeProfit();
    if (stopLoss === null || takeProfit === null) {
      return null;
    }
    const risk = Math.abs(this.reference() - stopLoss);
    return risk > 0 ? Math.abs(takeProfit - this.reference()) / risk : null;
  });
  /** The order button, as TradingView words it: "0.05 PAXGUSDT MERCADO", "... LÍMITE 2,310.00". */
  protected readonly submitDetail = computed(() => {
    const type = this.orderType();
    const price = this.orderPrice();
    const where =
      type === 'market' || price === null
        ? this.i18n.messages().practice.marketCaps
        : `${this.i18n.messages().trading.orderTypes[type].toUpperCase()} ${formatNumber(price, this.locale, priceDigits(price))}`;
    return `${formatLots(this.lots())} ${this.symbol()} ${where}`;
  });

  /** The ticket's order, drawn on the chart as lines the student can drag. */
  protected readonly draft = computed<OrderDraft | null>(() => {
    const replay = this.replay();
    if (this.phase() !== 'playing' || !this.drafting() || !replay) {
      return null;
    }
    const input: OpenTradeInput = {
      side: this.side(),
      orderType: this.orderType(),
      price: this.orderType() === 'market' ? null : this.orderPrice(),
      lots: this.lots(),
      stopLoss: this.stopLoss(),
      takeProfit: this.takeProfit(),
    };
    return {
      side: input.side,
      orderType: input.orderType,
      price: input.price,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      quantity: this.units(),
      error: validateOrder(
        input,
        replay.current().close,
        replay.available(),
        this.i18n.messages().orderErrors,
      ),
    };
  });

  private timer?: ReturnType<typeof setInterval>;
  private quickErrorTimer?: ReturnType<typeof setTimeout>;
  private clock?: ReturnType<typeof setInterval>;

  constructor() {
    this.loadSessions();
    this.loadEvaluations();
    inject(DestroyRef).onDestroy(() => {
      this.pause();
      clearInterval(this.clock);
      clearTimeout(this.quickErrorTimer);
      // Leaving mid-replay ends the session, so open trades are not left dangling.
      if (this.phase() === 'playing') {
        void this.finish();
      }
    });
  }

  /** Starts free practice at a random start or the date the student picked. */
  protected start(): Promise<void> {
    const instrument = this.instrument();
    const replayStart =
      this.randomStart() || !this.startDate()
        ? randomReplayStart(instrument)
        : replayStartAt(instrument, Date.parse(`${this.startDate()}T00:00:00Z`));
    return this.begin(replayStart, null);
  }

  /** Starts the student's one attempt at an evaluation, after they confirm. */
  protected async startEvaluation(evaluation: Evaluation): Promise<void> {
    const t = this.i18n.messages().practice;
    if (!findInstrument(evaluation.symbol)) {
      this.error.set(t.startFailed);
      return;
    }
    if (!confirm(t.confirmEvaluation(evaluation.title, evaluation.durationMinutes))) {
      return;
    }
    this.symbol.set(evaluation.symbol);
    this.hideDates.set(evaluation.hideDates);
    await this.begin(evaluation.replayStart, evaluation);
  }

  private async begin(replayStart: number, evaluation: Evaluation | null): Promise<void> {
    const { symbol } = this.instrument();
    const timeframe = DEFAULT_TIMEFRAME;
    const user = this.auth.user();
    if (!user) {
      return;
    }
    this.error.set(null);
    this.phase.set('loading');
    try {
      // The minute before the start is the replay's history: its close is the first price.
      const [minutes, history] = await Promise.all([
        this.market.loadCandles(symbol, '1m', replayStart - MINUTE),
        this.loadHistory(symbol, timeframe, replayStart),
      ]);
      if (minutes.length < MIN_REPLAY_MINUTES) {
        throw new Error('Not enough data');
      }
      const balance = evaluation?.startingBalance ?? STARTING_BALANCE;
      const replay = new Replay(minutes, 1, balance, true);
      if (minutes.length < REPLAY_BARS) {
        replay.extend([], true);
      }
      const session = {
        uid: user.uid,
        userName: this.auth.profile()?.displayName || user.email || user.uid,
        symbol,
        interval: timeframe.interval,
        replayStart,
        startingBalance: replay.startingBalance,
      };
      // Taken before the write, so the countdown never runs past the server's limit.
      const startedAt = Date.now();
      const sessionId = evaluation
        ? await this.practice.startSession(session, evaluation).catch(() => {
            throw new Error(this.i18n.messages().practice.evaluationStartFailed);
          })
        : await this.practice.startSession(session);
      this.builders = new Map();
      this.histories.set({ [timeframe.interval]: history });
      this.timeframe.set(timeframe);
      this.replayStart.set(replayStart);
      this.replay.set(replay);
      this.sessionId.set(sessionId);
      this.orderError.set(null);
      this.stopLoss.set(null);
      this.takeProfit.set(null);
      this.drafting.set(false);
      this.tab.set('positions');
      this.evaluation.set(evaluation);
      this.phase.set('playing');
      if (evaluation) {
        this.startClock(startedAt + evaluation.durationMinutes * MINUTE);
      }
    } catch (e) {
      const t = this.i18n.messages().practice;
      const message = (e as Error).message;
      this.error.set(message === t.evaluationStartFailed ? message : t.startFailed);
      this.phase.set('setup');
    }
  }

  /** Counts the attempt's time down and finishes it when it runs out. */
  private startClock(deadline: number): void {
    this.deadline.set(deadline);
    this.now.set(Date.now());
    clearInterval(this.clock);
    this.clock = setInterval(() => {
      this.now.set(Date.now());
      if (this.now() >= deadline) {
        void this.finish();
      }
    }, 1000);
  }

  /** Switches the chart's timeframe, loading its history the first time. */
  protected async setTimeframe(timeframe: Timeframe): Promise<void> {
    const { interval } = timeframe;
    if (!this.histories()[interval]) {
      this.switching.set(interval);
      try {
        const history = await this.loadHistory(this.symbol(), timeframe, this.replayStart());
        this.histories.update((all) => ({ ...all, [interval]: history }));
      } catch {
        this.error.set(this.i18n.messages().practice.timeframeFailed);
        return;
      } finally {
        this.switching.set(null);
      }
    }
    this.timeframe.set(timeframe);
    if (this.playing()) {
      this.pause();
      this.play();
    }
  }

  /**
   * Shows the next bar of the chart's timeframe, minute by minute so orders fill and stops
   * trigger at the right moment. Waits for data when the loaded minutes run out, and ends the
   * session after the last one.
   */
  protected step(): void {
    const replay = this.replay();
    if (!replay || this.phase() !== 'playing') {
      return;
    }
    const end = nextBarEnd(replay.current().time, this.barSeconds());
    if (replay.candles.at(-1)!.time < end && !replay.hasAllCandles()) {
      void this.loadMinutes();
      return;
    }
    const closed: PracticeTrade[] = [];
    const filled: PracticeTrade[] = [];
    while (!replay.atEnd() && replay.current().time < end) {
      const result = replay.step()!;
      closed.push(...result.closed);
      filled.push(...result.filled);
    }
    // Fills go first: an order can fill and close within the same bar.
    filled.forEach((trade) => this.persist((id) => this.practice.fillOrder(id, trade)));
    closed.forEach((trade) => this.persistClose(trade));
    if (filled.length && !closed.length) {
      this.persist((sessionId) => this.practice.updateSummary(sessionId, this.summary(replay)));
    }
    if (replay.finished()) {
      void this.finish();
    } else if (replay.candles.length - 1 - replay.cursor() < PREFETCH_MINUTES) {
      void this.loadMinutes();
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

  /** Places the order set up in the ticket. */
  protected async openTrade(): Promise<void> {
    const placed = await this.place({
      side: this.side(),
      orderType: this.orderType(),
      price: this.orderPrice(),
      lots: this.lots(),
      stopLoss: this.stopLoss(),
      takeProfit: this.takeProfit(),
    });
    if (placed) {
      this.discardDraft();
      this.tab.set(placed.status === 'pending' ? 'orders' : 'positions');
    }
  }

  /** The count of live trades on the chart: opens their list, positions first. */
  protected showTrades(list: HTMLElement): void {
    this.tab.set(this.replay()?.openTrades().length ? 'positions' : 'orders');
    list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Takes the order being set up off the chart and clears its exits. */
  protected discardDraft(): void {
    this.drafting.set(false);
    this.stopLoss.set(null);
    this.takeProfit.set(null);
    this.orderError.set(null);
    this.setOrderType(this.orderType());
  }

  /** One-click market order from the chart, with the ticket's size and no SL/TP. */
  protected async quickTrade(side: TradeSide): Promise<void> {
    const placed = await this.place(
      {
        side,
        orderType: 'market',
        price: null,
        lots: this.lots(),
        stopLoss: null,
        takeProfit: null,
      },
      (message) => this.showQuickError(message),
    );
    if (placed) {
      this.tab.set('positions');
    }
  }

  /**
   * The one-click box sits on the chart, far from the ticket on a phone: its refusals show
   * right under it, until the next try or a few seconds later.
   */
  private showQuickError(message: string | null): void {
    clearTimeout(this.quickErrorTimer);
    this.quickError.set(message);
    if (message) {
      this.quickErrorTimer = setTimeout(() => this.quickError.set(null), QUICK_ERROR_MS);
    }
  }

  private async place(
    input: OpenTradeInput,
    report: (message: string | null) => void = (message) => this.orderError.set(message),
  ): Promise<PracticeTrade | null> {
    const replay = this.replay();
    const sessionId = this.sessionId();
    const uid = this.auth.user()?.uid;
    if (!replay || !sessionId || !uid) {
      return null;
    }
    let trade: PracticeTrade;
    try {
      trade = replay.open(
        this.practice.newTradeId(sessionId),
        input,
        this.i18n.messages().orderErrors,
      );
    } catch (e) {
      report((e as Error).message);
      return null;
    }
    report(null);
    this.placing.set(true);
    try {
      await this.practice.openTrade(sessionId, uid, trade);
      return trade;
    } catch {
      replay.discard(trade.id);
      report(this.i18n.messages().practice.saveTradeFailed);
      return null;
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

  protected cancelOrder(order: PracticeTrade): void {
    const replay = this.replay();
    if (replay) {
      const cancelled = replay.cancel(order.id);
      this.persist((id) => this.practice.cancelOrder(id, cancelled));
    }
  }

  protected setSide(side: TradeSide): void {
    this.drafting.set(true);
    this.side.set(side);
    this.setOrderType(this.orderType());
    this.stopLoss.set(null);
    this.takeProfit.set(null);
  }

  /** Switches the ticket's order type, starting a limit or stop price next to the market. */
  protected setOrderType(type: OrderType): void {
    this.orderType.set(type);
    this.orderError.set(null);
    const current = this.replay()?.current().close;
    if (type === 'market' || current === undefined) {
      this.orderPrice.set(null);
      return;
    }
    const below = fillsBelow(this.side(), type);
    this.orderPrice.set(roundPrice(current * (1 + (below ? -1 : 1) * DEFAULT_ORDER_OFFSET)));
  }

  protected levelPrice(field: LevelField): number | null {
    return this[field]();
  }

  protected setLevel(field: LevelField, price: number | null): void {
    this[field].set(price);
  }

  /** The ticket's order type tabs: its line shows up on the chart. */
  protected pickOrderType(type: OrderType): void {
    this.drafting.set(true);
    this.setOrderType(type);
  }

  /**
   * The order type menu on the chart's order line: a limit or stop keeps the line where it is
   * (and says if it is on the wrong side of the market); a market order moves to the price.
   */
  protected changeDraftType(type: OrderType): void {
    const price = this.orderPrice();
    if (type === 'market' || price === null) {
      this.setOrderType(type);
    } else {
      this.orderType.set(type);
    }
  }

  /** The take profit / stop loss checkboxes: on adds the level at a default distance. */
  protected toggleLevel(field: LevelField, on: boolean): void {
    this.drafting.set(true);
    const current = this.replay()?.current().close;
    if (!on || current === undefined) {
      this[field].set(null);
      return;
    }
    this[field].set(defaultLevel(this.side(), field, this.reference()));
  }

  /** P/L of the ticket's order if it exits at `price`. */
  protected levelPnl(price: number): number {
    const move = this.side() === 'long' ? price - this.reference() : this.reference() - price;
    return move * this.units();
  }

  /** Lots typed on the chart: whole steps of 0.01, at least one. */
  protected setLots(value: string): void {
    const lots = Number(value);
    const steps = Number.isFinite(lots) ? Math.round(lots / LOT_STEP) : 1;
    this.lots.set(Number((Math.max(1, steps) * LOT_STEP).toFixed(2)));
  }

  protected useFraction(fraction: number): void {
    const available = this.replay()?.available() ?? 0;
    const perLot = marginFor(1, this.reference());
    const steps = perLot > 0 ? Math.floor((available / perLot / LOT_STEP) * fraction) : 0;
    this.lots.set(Number((Math.max(1, steps) * LOT_STEP).toFixed(2)));
  }

  /** Adds a stop loss or take profit to a position or pending order, ready to drag. */
  protected addTradeLevel(trade: PracticeTrade, field: LevelField): void {
    const replay = this.replay();
    if (replay) {
      const reference = trade.status === 'pending' ? trade.orderPrice! : replay.current().close;
      this.setTradeLevel(trade, field, defaultLevel(trade.side, field, reference));
    }
  }

  protected setTradeLevel(trade: PracticeTrade, field: LevelField, price: number | null): void {
    this.changeTrade(trade, {
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      orderPrice: trade.orderPrice,
      [field]: price,
    });
  }

  /** A line dragged on the chart: updates the ticket, or moves a pending order or open trade. */
  protected onLevelMoved(move: LevelMove): void {
    if (move.target === 'draft') {
      const field = {
        price: this.orderPrice,
        stopLoss: this.stopLoss,
        takeProfit: this.takeProfit,
      };
      field[move.field].set(move.price);
      return;
    }
    const trade = this.replay()
      ?.trades()
      .find((t) => t.id === move.target);
    if (trade) {
      this.changeTrade(trade, {
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        orderPrice: trade.orderPrice,
        [move.field === 'price' ? 'orderPrice' : move.field]: move.price,
      });
    }
  }

  private changeTrade(trade: PracticeTrade, levels: TradeLevels): void {
    const replay = this.replay();
    if (!replay) {
      return;
    }
    try {
      const updated = replay.modify(trade.id, levels, this.i18n.messages().orderErrors);
      this.persist((id) => this.practice.updateLevels(id, updated), trade);
      this.orderError.set(null);
    } catch (e) {
      this.orderError.set((e as Error).message);
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
    clearInterval(this.clock);
    this.deadline.set(null);
    this.phase.set('finished');
    const { cancelled, closed } = replay.closeAll('sessionEnd');
    try {
      await Promise.all([
        ...cancelled.map((order) => this.practice.cancelOrder(sessionId, order)),
        ...closed.map((trade) => this.practice.closeTrade(sessionId, trade)),
      ]);
      await this.practice.finishSession(sessionId, this.summary(replay));
      const evaluation = this.evaluation();
      void this.notifications.notifyActivity({
        type: evaluation ? 'evaluationFinished' : 'practiceFinished',
        kind: evaluation ? 'evaluation' : 'practice',
        refId: sessionId,
        contextId: evaluation?.id ?? null,
        title: evaluation?.title ?? '',
      });
    } catch {
      this.error.set(this.i18n.messages().practice.finishFailed);
    }
    this.loadSessions();
    if (this.evaluation()) {
      this.loadEvaluations();
    }
  }

  protected reset(): void {
    this.focused.set(null);
    this.evaluation.set(null);
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

  /** The × on a chart label: closes a position or cancels a pending order. */
  protected onTradeClosed(id: string): void {
    const trade = this.replay()
      ?.trades()
      .find((t) => t.id === id);
    if (trade?.status === 'open') {
      this.closeTrade(trade);
    } else if (trade?.status === 'pending') {
      this.cancelOrder(trade);
    }
  }

  /** An order from the chart's "+" menu: its line shows up, ready to adjust and place. */
  protected onOrderAt(order: OrderAt): void {
    this.side.set(order.side);
    this.orderType.set(order.orderType);
    this.orderPrice.set(order.price);
    this.stopLoss.set(null);
    this.takeProfit.set(null);
    this.orderError.set(null);
    this.drafting.set(true);
  }

  /** A TP/SL tab clicked on a chart line: adds that level at its default distance. */
  protected onLevelAdded({ target, field }: LevelRemove): void {
    if (target === 'draft') {
      this.toggleLevel(field, true);
      return;
    }
    const trade = this.replay()
      ?.trades()
      .find((t) => t.id === target);
    if (trade) {
      this.addTradeLevel(trade, field);
    }
  }

  /** The × on a stop loss or take profit label. */
  protected onLevelRemoved({ target, field }: LevelRemove): void {
    if (target === 'draft') {
      this.setLevel(field, null);
      return;
    }
    const trade = this.replay()
      ?.trades()
      .find((t) => t.id === target);
    if (trade) {
      this.setTradeLevel(trade, field, null);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target;
    const typing = target instanceof Element && target.closest('input, select, textarea');
    if (event.key === 'ArrowRight' && !typing) {
      event.preventDefault();
      this.step();
    }
  }

  /** Fetches the next chunk of one-minute candles, up to `REPLAY_DAYS` after the start. */
  private async loadMinutes(): Promise<void> {
    const replay = this.replay();
    if (!replay || this.loadingMinutes || replay.hasAllCandles()) {
      return;
    }
    this.loadingMinutes = true;
    try {
      const from = (replay.candles.at(-1)!.time + 60) * 1000;
      const limit = this.replayStart() + REPLAY_DAYS * 24 * 60 * MINUTE;
      const more = await this.market.loadCandles(this.symbol(), '1m', from, REPLAY_BARS, {
        background: true,
      });
      const within = more.filter((c) => c.time * 1000 < limit);
      replay.extend(within, more.length < REPLAY_BARS || within.length < more.length);
    } catch {
      this.pause();
      this.error.set(this.i18n.messages().practice.moreBarsFailed);
    } finally {
      this.loadingMinutes = false;
    }
  }

  /** The `HISTORY_BARS` bars of a timeframe before the replay starts. */
  private loadHistory(
    symbol: string,
    timeframe: Timeframe,
    replayStart: number,
  ): Promise<Candle[]> {
    return this.market.loadHistory(symbol, timeframe.interval, replayStart, HISTORY_BARS);
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
    ]).catch(() => this.error.set(this.i18n.messages().practice.closeFailed));
  }

  /**
   * Logs a change in the background. If it fails, says so, and puts back `previous` (the
   * trade before an edit) so the screen matches what was saved.
   */
  private persist(write: (sessionId: string) => Promise<void>, previous?: PracticeTrade): void {
    const sessionId = this.sessionId();
    if (!sessionId) {
      return;
    }
    write(sessionId).catch(() => {
      if (previous) {
        this.replay()?.restore(previous);
      }
      this.error.set(this.i18n.messages().practice.changeFailed);
    });
  }

  private summary(replay: Replay) {
    return {
      balance: replay.balance(),
      pnl: replay.realized(),
      tradeCount: replay.filledCount(),
    };
  }

  /** The evaluations assigned to the student and whether they took each one. */
  private async loadEvaluations(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    try {
      const evaluations = await this.evaluationService.assignedTo(
        uid,
        this.auth.profile()?.mentorshipIds,
      );
      const attempts = evaluations.length
        ? await this.practice.myAttempts(
            uid,
            evaluations.map((e) => e.id),
          )
        : [];
      const now = Date.now();
      this.evaluations.set(
        evaluations.map((evaluation) => ({
          evaluation,
          window: evaluationWindow(evaluation, now),
          attempt: attempts.find((a) => a.evaluationId === evaluation.id) ?? null,
        })),
      );
    } catch {
      this.evaluations.set([]);
    }
  }

  protected filterSessions(filters: SessionFilters): void {
    this.historyFilters.set(filters);
    this.loadSessions();
  }

  protected pageSessions(direction: 'previous' | 'next'): void {
    this.reviewing.set(null);
    this.historyFailed.set(false);
    this.history[direction]().catch(() => this.historyFailed.set(true));
  }

  private loadSessions(): void {
    this.reviewing.set(null);
    this.historyFailed.set(false);
    if (this.auth.user()?.uid) {
      this.history.first().catch(() => this.historyFailed.set(true));
    }
  }
}

/** A stop loss or take profit at the default distance from `reference`, on the right side. */
function defaultLevel(side: TradeSide, field: LevelField, reference: number): number {
  const direction = (side === 'long' ? 1 : -1) * (field === 'stopLoss' ? -1 : 1);
  const offset = field === 'stopLoss' ? DEFAULT_STOP_OFFSET : DEFAULT_TARGET_OFFSET;
  return roundPrice(reference * (1 + direction * offset));
}
