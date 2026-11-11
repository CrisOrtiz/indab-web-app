import { DecimalPipe, PercentPipe, formatNumber, formatPercent } from '@angular/common';
import {
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import {
  Evaluation,
  EvaluationWindow,
  datesLocked,
  evaluationWindow,
} from '../../core/models/evaluation';
import {
  Candle,
  OrderType,
  PracticeSession,
  PracticeTrade,
  SessionResume,
  TradeSide,
} from '../../core/models/practice';
import { EvaluationService } from '../evaluations/evaluation.service';
import { ChartSettingsService } from './chart-settings.service';
import { NewsService } from './news.service';
import { newsModeFor } from '../../core/models/market-news';
import { BarBuilder, formatElapsed, nextBarEnd } from './bars';
import { ReplayControls } from './replay-controls';
import { EvaluationBriefing } from './evaluation-briefing';
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
import {
  formatCountdown,
  formatLots,
  priceDigits,
  roundPrice,
  signedMoney,
} from './practice-format';
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
import {
  Drawing,
  LevelMove,
  LevelRemove,
  LevelsMove,
  OrderAt,
  OrderDraft,
  ReplayChart,
} from './replay-chart';
import {
  attemptDeadline,
  attemptTimeUp,
  clearLocalResume,
  shownStatus,
  staleSessions,
  pickResume,
  readLocalResume,
  resumeTime,
  writeLocalResume,
} from './resume';
import { liveMinutes } from './live';
import { LiveConnection, LiveFeed, LiveFeedStatus } from './live-feed';
import { goldClosed } from './market-hours';
import { ServerClock } from './server-clock';
import { SessionFilterBar } from './session-filters';
import { SessionTabs } from './session-tabs';
import { SessionReview } from './session-review';
import { SessionStatsPanel } from './session-stats';
import { filledTrades } from './trade-boxes';
import { TradeJournal } from './trade-journal';
import { OrderWarning, WarnedOrder, orderWarnings } from './order-warnings';
import { RISK_ALLOWED } from '../ranking/score';
import { TradeNavigator } from './trade-navigator';

type Phase = 'setup' | 'loading' | 'playing' | 'finished';
/** Free practice on a replay of the past, or live on the market's candles as they form. */
export type PracticeMode = 'replay' | 'live';
type Tab = 'positions' | 'orders' | 'history' | 'stats';
type LevelField = 'stopLoss' | 'takeProfit';

export const SPEEDS = [1, 2, 5, 10];

// Where new levels start, as a fraction of the reference price; students then drag them.
const DEFAULT_ORDER_OFFSET = 0.005;
const DEFAULT_STOP_OFFSET = 0.01;
const DEFAULT_TARGET_OFFSET = 0.02;

/** Fewer one-minute candles than this means the window hit the end of the data. */
const MIN_REPLAY_MINUTES = 60;
/** How often a live attempt checks the clock for its next candle (ms). */
const LIVE_TICK_MS = 250;
/** Fetch the next chunk of minutes when fewer than this are left to replay. */
const PREFETCH_MINUTES = 600;
/** How long a refused one-click order says why on the chart. */
export const QUICK_ERROR_MS = 6000;
/** While the replay plays, where it is goes to Firestore at most this often. */
export const RESUME_SAVE_MS = 15_000;
/** Other changes to pick up after a reload (drawings, timeframe, speed) go sooner. */
export const RESUME_CHANGE_MS = 2_000;
/** The chart of a live session starts on a bar of the longest timeframe, so all line up. */
const ANCHOR_MS = TIMEFRAMES.at(-1)!.ms;

/** Where a live session's chart starts building bars from minutes: the 4-hour bar of `time`. */
export function chartAnchor(time: number): number {
  return Math.floor(time / ANCHOR_MS) * ANCHOR_MS;
}

/** Active sessions looked up at once: the open ones, and older ones left to close. */
const OPEN_SESSIONS_MAX = 20;

/** An evaluation assigned to the student, with their attempt if they took it. */
export interface EvaluationCard {
  evaluation: Evaluation;
  window: EvaluationWindow;
  attempt: PracticeSession | null;
}

export { formatCountdown } from './practice-format';

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

/** Minutes before the end of an attempt when the student is warned. */
const TIME_WARNINGS = [5, 1];

/** What the order ticket holds, kept while it edits a placed order. */
interface TicketState {
  side: TradeSide;
  orderType: OrderType;
  orderPrice: number | null;
  lots: number;
  stopLoss: number | null;
  takeProfit: number | null;
  drafting: boolean;
}

@Component({
  selector: 'app-practice',
  imports: [
    RouterLink,
    LocalDatePipe,
    DecimalPipe,
    EvaluationBriefing,
    PercentPipe,
    Pager,
    ReplayChart,
    ReplayControls,
    SessionFilterBar,
    SessionReview,
    SessionStatsPanel,
    TradeJournal,
    TradeNavigator,
  ],
  providers: [SessionTabs],
  templateUrl: './practice.html',
  styleUrls: ['./practice.scss', './trading-panel.scss', './trading-account.scss'],
  host: {
    '(window:keydown)': 'onKey($event)',
    '(window:pagehide)': 'saveResumeNow()',
    '(document:visibilitychange)': 'saveResumeNow()',
  },
})
export class Practice {
  private readonly auth = inject(AuthService);
  private readonly market = inject(MarketDataService);
  private readonly practice = inject(PracticeService);
  private readonly notifications = inject(NotificationService);
  private readonly evaluationService = inject(EvaluationService);
  private readonly serverClock = inject(ServerClock);
  private readonly tabs = inject(SessionTabs);
  private readonly liveFeed = inject(LiveFeed);
  /** The indicators the user keeps on the chart. */
  protected readonly chartSettings = inject(ChartSettingsService);
  /** Economic news around the chart's bars, while the user keeps them on. */
  protected readonly news = inject(NewsService).feed(
    () => this.visibleCandles(),
    () => this.chartSettings.news() && this.newsMode() !== 'off',
  );
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
  /** Free practice on a replay or live (Cris, 2026-11-11). */
  protected readonly mode = signal<PracticeMode>('replay');
  /** Spot gold is closed now, so live trading has no candles. */
  protected readonly marketClosed = computed(() => goldClosed(this.now()));
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
  /** The trade just placed, whose journal entry gets the focus. */
  protected readonly journalFocus = signal<string | null>(null);
  /** When the attempt's time runs out (ms), by this device's clock. */
  protected readonly deadline = signal<number | null>(null);
  /** The evaluation whose instructions are shown before its attempt starts. */
  protected readonly briefing = signal<Evaluation | null>(null);
  /** The time warning on screen, as the attempt nears its end. */
  protected readonly timeWarning = signal<string | null>(null);
  /** Minutes left whose warning was already given, so each shows once. */
  private warned = new Set<number>();
  protected readonly now = signal(this.serverClock.now());
  /**
   * The attempt runs by the clock (its evaluation sets a pace): the replay moves on its own,
   * the same on every screen, and cannot be paused, stepped or sped up.
   */
  protected readonly live = computed(() => this.evaluation()?.pace != null);
  /** The session on screen trades the market live, on Binance's stream. */
  protected readonly realtime = signal(false);
  /** The live stream's connection. */
  protected readonly feedStatus = signal<LiveFeedStatus>('connecting');
  /** What a live session's status line says: the market closed, or the stream's state. */
  protected readonly liveState = computed<LiveFeedStatus | 'closed' | null>(() =>
    this.realtime() ? (this.marketClosed() ? 'closed' : this.feedStatus()) : null,
  );
  /** No play, step or speed: an evaluation run by the clock, or live trading. */
  protected readonly clockDriven = computed(() => this.live() || this.realtime());
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
  /** The one-click box's message is a warning about the order just sent, not a refusal. */
  protected readonly quickWarn = signal(false);
  protected readonly placing = signal(false);
  /** Whether the order being set up is on the chart. */
  protected readonly drafting = signal(false);
  /**
   * A placed order or open position loaded into the ticket to change it ("Editar"): a pending
   * order changes its price, lots, SL and TP; a position only its SL and TP.
   */
  protected readonly editing = signal<{ id: string; status: 'pending' | 'open' } | null>(null);
  protected readonly editingTrade = computed(() => {
    const id = this.editing()?.id;
    return id
      ? (this.replay()
          ?.trades()
          .find((t) => t.id === id) ?? null)
      : null;
  });
  protected readonly editingOpen = computed(() => this.editing()?.status === 'open');
  /** The ticket as the student left it before editing, put back afterwards. */
  private ticketBeforeEdit: TicketState | null = null;
  /** The drawings on the chart, kept with the session so a reload puts them back. */
  protected readonly drawings = signal<Drawing[]>([]);
  /**
   * Sessions the student left open, other than the one on screen: they go back to them, or
   * close them, from the setup.
   */
  protected readonly openSessions = signal<PracticeSession[]>([]);
  /** The open free practice: one at a time, so it is closed before another starts. */
  protected readonly openFree = computed(() =>
    this.openSessions().find((s) => s.durationMinutes == null),
  );
  /** The open session being closed from the list. */
  protected readonly closing = signal<string | null>(null);
  /** The session was picked up after a reload. */
  protected readonly resumed = signal(false);

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
  /**
   * Dates come back once the replay is over; for an evaluation that hides them, only once its
   * window closes, so nobody who finished can tell others which day it is.
   */
  protected readonly datesHidden = computed(
    () =>
      this.hideDates() &&
      (this.phase() === 'playing' || datesLocked(this.evaluation(), this.now())),
  );
  /** How much of the economic news the chart shows (an evaluation's creator picks it). */
  protected readonly newsMode = computed(() =>
    newsModeFor(
      this.evaluation()?.news ?? (this.evaluation() ? 'reveal' : null),
      this.phase() === 'playing',
      this.datesHidden(),
    ),
  );
  protected readonly closedTrades = computed(() =>
    [...(this.replay()?.closedTrades() ?? [])].reverse(),
  );

  /**
   * Where the ticket's order would enter: the market, or its limit/stop price; for a position
   * being edited, its entry (its SL/TP P/L and risk/reward count from there).
   */
  protected readonly reference = computed(() => {
    const edited = this.editingTrade();
    if (edited?.status === 'open') {
      return edited.entryPrice;
    }
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
  /**
   * What to keep in mind before sending the ticket's order: it risks more than 15 % of the
   * account, has no stop loss or turns around right after a loss (Cris, 2026-11-11).
   */
  protected readonly ticketWarnings = computed(() =>
    this.warningsFor({
      side: this.side(),
      entry: this.reference(),
      stopLoss: this.stopLoss(),
      units: this.units(),
    }),
  );
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
    if (this.phase() !== 'playing' || !this.drafting() || this.editing() || !replay) {
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

  /** Where the running session is, to pick it up after a reload. */
  private readonly resumeState = computed<SessionResume | null>(
    () => {
      const replay = this.replay();
      if (this.phase() !== 'playing' || !replay) {
        return null;
      }
      return {
        time: replay.current().time,
        interval: this.timeframe().interval,
        hideDates: this.hideDates(),
        speed: this.speed(),
        drawings: this.drawings(),
      };
    },
    // A live minute changes a few times a second; only a new minute moves where it is.
    { equal: sameResume },
  );

  private timer?: ReturnType<typeof setInterval>;
  private quickErrorTimer?: ReturnType<typeof setTimeout>;
  private clock?: ReturnType<typeof setInterval>;
  /** Moves a live attempt's replay along with the clock. */
  private liveTimer?: ReturnType<typeof setInterval>;
  /** Binance's stream feeding a live session, and the clock telling when gold is closed. */
  private feed?: LiveConnection;
  private feedClock?: ReturnType<typeof setInterval>;
  /** Fetching the minutes a dropped stream missed; its own updates wait meanwhile. */
  private catchingUp = false;
  /** When the live attempt on screen started (ms, server clock). */
  private liveStart = 0;
  /** Minutes staff added to the attempt on screen. */
  private extraMinutes = 0;
  /** Stops following the attempt on screen for staff changes. */
  private unwatch?: () => void;
  /** Something staff did to the attempt on screen (minutes added), told to the student. */
  protected readonly notice = signal<string | null>(null);
  /** Counts down the open attempts listed on the setup. */
  private openClock?: ReturnType<typeof setInterval>;
  /** The next save of `resume` to Firestore, and when it is due. */
  private resumeTimer?: ReturnType<typeof setTimeout>;
  private resumeDue = 0;
  /** The last `resume` kept, and whether Firestore has it yet. */
  private lastResume: SessionResume | null = null;
  private resumeSaved = true;

  constructor() {
    void this.chartSettings.load();
    this.loadSessions();
    this.loadEvaluations();
    void this.resumeActive();
    // The same session opened in another tab of this browser takes over from this one.
    this.tabs.onTaken(() => {
      if (this.phase() === 'playing') {
        this.leaveOpen();
        this.error.set(this.i18n.messages().practice.openedElsewhere);
      }
    });
    // The trade being edited filled, closed or was cancelled meanwhile: the edit is over.
    effect(() => {
      const editing = this.editing();
      if (!editing) {
        return;
      }
      const playing = this.phase() === 'playing';
      if (!playing || this.editingTrade()?.status !== editing.status) {
        untracked(() => this.stopEditing(playing ? this.i18n.messages().practice.editEnded : null));
      }
    });
    effect(() => {
      const state = this.resumeState();
      if (state) {
        untracked(() => this.keepResume(state));
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.pause();
      clearInterval(this.clock);
      clearInterval(this.liveTimer);
      this.stopFeed();
      this.tabs.close();
      this.stopWatching();
      clearTimeout(this.quickErrorTimer);
      clearTimeout(this.resumeTimer);
      clearInterval(this.openClock);
      // Leaving the page keeps the session open where it is: the student comes back to it
      // here (from this or another device) until they close it or its time runs out.
      this.saveResumeNow();
    });
  }

  /** Starts free practice at a random start or the date the student picked. */
  protected async start(): Promise<void> {
    if (this.openFree()) {
      return;
    }
    if (this.mode() === 'live') {
      return this.beginLive();
    }
    const instrument = this.instrument();
    const replayStart =
      this.randomStart() || !this.startDate()
        ? randomReplayStart(instrument)
        : replayStartAt(instrument, Date.parse(`${this.startDate()}T00:00:00Z`));
    return this.begin(replayStart, null);
  }

  /** Picks replay or live in the setup; live checks whether gold is open now. */
  protected setMode(mode: PracticeMode): void {
    this.mode.set(mode);
    this.now.set(this.serverClock.now());
  }

  /**
   * Starts live trading: the chart shows today's bars up to now and then follows Binance's
   * stream minute by minute. Gold only trades in its hours, so it refuses while it is closed.
   */
  private async beginLive(): Promise<void> {
    const { symbol } = this.instrument();
    const timeframe = DEFAULT_TIMEFRAME;
    const user = this.auth.user();
    if (!user) {
      return;
    }
    const t = this.i18n.messages().practice;
    this.error.set(null);
    this.phase.set('loading');
    try {
      await this.serverClock.sync();
      const now = this.serverClock.now();
      this.now.set(now);
      if (goldClosed(now)) {
        throw new Error(t.marketClosed);
      }
      const anchor = chartAnchor(now);
      // The minute before the anchor is the replay's one bar of history, as in a replay.
      const [minutes, history] = await Promise.all([
        this.market.loadMinutesSince(symbol, anchor - MINUTE, 1),
        this.loadHistory(symbol, timeframe, anchor),
      ]);
      if (minutes.length < 2) {
        throw new Error(t.liveNoData);
      }
      const replay = new Replay(minutes, 1, STARTING_BALANCE, true);
      replay.resume([], minutes.at(-1)!.time);
      const sessionId = await this.practice.startSession({
        uid: user.uid,
        userName: this.auth.profile()?.displayName || user.email || user.uid,
        symbol,
        interval: timeframe.interval,
        replayStart: Math.floor(now / MINUTE) * MINUTE,
        startingBalance: replay.startingBalance,
        live: true,
      });
      this.hideDates.set(false);
      this.enter(sessionId, replay, anchor, timeframe, history, null, [], true);
    } catch (e) {
      const message = (e as Error).message;
      this.error.set(
        message === t.marketClosed || message === t.liveNoData ? message : t.startFailed,
      );
      this.phase.set('setup');
    }
  }

  /** Follows Binance's stream for the live session on screen. */
  private startFeed(symbol: string): void {
    this.stopFeed();
    this.feedStatus.set('connecting');
    this.now.set(this.serverClock.now());
    this.feedClock = setInterval(() => this.now.set(this.serverClock.now()), 1000);
    this.feed = this.liveFeed.connect(symbol, {
      candle: (candle) => this.onLiveCandle(candle),
      opened: () => void this.catchUpLive(),
      status: (status) => this.feedStatus.set(status),
    });
  }

  private stopFeed(): void {
    this.feed?.close();
    this.feed = undefined;
    clearInterval(this.feedClock);
    this.feedClock = undefined;
  }

  /** A live update: the chart moves, orders fill and stops trigger on it. */
  private onLiveCandle(candle: Candle): void {
    const replay = this.replay();
    if (!replay || !this.realtime() || this.catchingUp || this.phase() !== 'playing') {
      return;
    }
    const result = replay.tick(candle);
    if (result) {
      this.record(replay, result.filled, result.closed);
    }
  }

  /**
   * The stream (re)connected: fetches the minutes since the last one shown, which it did not
   * send while it was down (or before it first opened), and settles orders on them.
   */
  private async catchUpLive(): Promise<void> {
    const replay = this.replay();
    if (!replay || !this.realtime() || this.catchingUp) {
      return;
    }
    this.catchingUp = true;
    try {
      const from = replay.candles.at(-1)!.time * 1000;
      const minutes = await this.market.catchUpMinutes(this.symbol(), from);
      if (this.replay() !== replay || this.phase() !== 'playing') {
        return;
      }
      const filled: PracticeTrade[] = [];
      const closed: PracticeTrade[] = [];
      for (const minute of minutes) {
        const result = replay.tick(minute);
        filled.push(...(result?.filled ?? []));
        closed.push(...(result?.closed ?? []));
      }
      this.record(replay, filled, closed);
    } catch {
      // The stream itself goes on; the next drop tries again.
    } finally {
      this.catchingUp = false;
    }
  }

  /** Shows the instructions before the student's one attempt at an evaluation. */
  protected startEvaluation(evaluation: Evaluation): void {
    if (!findInstrument(evaluation.symbol)) {
      this.error.set(this.i18n.messages().practice.startFailed);
      return;
    }
    this.briefing.set(evaluation);
  }

  /** Starts the attempt once the student has read the instructions. */
  protected async confirmEvaluation(): Promise<void> {
    const evaluation = this.briefing();
    this.briefing.set(null);
    if (!evaluation) {
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
        evaluation ? this.serverClock.sync() : null,
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
      const startedAt = this.serverClock.now();
      const sessionId = evaluation
        ? await this.practice.startSession(session, evaluation).catch(() => {
            throw new Error(this.i18n.messages().practice.evaluationStartFailed);
          })
        : await this.practice.startSession(session);
      this.enter(sessionId, replay, replayStart, timeframe, history, evaluation, []);
      if (evaluation) {
        this.extraMinutes = 0;
        this.startLive(evaluation, startedAt);
        this.startClock(startedAt + evaluation.durationMinutes * MINUTE);
        this.watchAttempt(sessionId, startedAt, evaluation.durationMinutes);
      }
    } catch (e) {
      const t = this.i18n.messages().practice;
      const message = (e as Error).message;
      this.error.set(message === t.evaluationStartFailed ? message : t.startFailed);
      this.phase.set('setup');
    }
  }

  /** Shows a session's replay, ready to trade. */
  private enter(
    sessionId: string,
    replay: Replay,
    replayStart: number,
    timeframe: Timeframe,
    history: Candle[],
    evaluation: Evaluation | null,
    drawings: Drawing[],
    live = false,
  ): void {
    this.stopFeed();
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
    this.drawings.set(drawings);
    this.resumed.set(false);
    this.notice.set(null);
    this.lastResume = null;
    this.resumeSaved = true;
    this.realtime.set(live);
    this.phase.set('playing');
    this.tabs.open(sessionId);
    if (live) {
      this.startFeed(this.symbol());
    }
  }

  /**
   * Follows the attempt on screen while it runs: minutes staff add move the deadline at once,
   * and an attempt staff delete (so the student takes it again) leaves the screen.
   */
  private watchAttempt(sessionId: string, startedAt: number, durationMinutes: number): void {
    this.stopWatching();
    this.unwatch = this.practice.watchSession(sessionId, (session) => {
      if (this.sessionId() !== sessionId || this.phase() !== 'playing') {
        return;
      }
      const t = this.i18n.messages().practice;
      if (!session) {
        this.dropReset(sessionId);
        return;
      }
      const extra = session.extraMinutes ?? 0;
      if (extra > this.extraMinutes) {
        const added = extra - this.extraMinutes;
        this.extraMinutes = extra;
        this.startClock(startedAt + (durationMinutes + extra) * MINUTE);
        this.notice.set(t.extraTimeGiven(added));
      }
    });
  }

  private stopWatching(): void {
    this.unwatch?.();
    this.unwatch = undefined;
  }

  /** Staff deleted the attempt on screen so the student can take it again: back to the list. */
  private dropReset(sessionId: string): void {
    this.pause();
    clearInterval(this.clock);
    clearInterval(this.liveTimer);
    this.stopFeed();
    clearTimeout(this.resumeTimer);
    this.tabs.close();
    this.realtime.set(false);
    this.stopWatching();
    clearLocalResume(sessionId);
    this.deadline.set(null);
    this.focused.set(null);
    this.evaluation.set(null);
    this.replay.set(null);
    this.sessionId.set(null);
    this.resumed.set(false);
    this.notice.set(null);
    this.phase.set('setup');
    this.error.set(this.i18n.messages().practice.attemptReset);
    this.loadSessions();
    void this.refreshOpen().then(() => this.loadEvaluations());
  }

  /** Moves an attempt at an evaluation with a pace along with the clock, from `startedAt`. */
  private startLive(evaluation: Evaluation, startedAt: number): void {
    clearInterval(this.liveTimer);
    if (evaluation.pace == null) {
      return;
    }
    this.liveStart = startedAt;
    this.tickLive();
    this.liveTimer = setInterval(() => this.tickLive(), LIVE_TICK_MS);
  }

  /**
   * Shows every one-minute candle the clock has reached since the attempt started (all at once
   * after a reload or time away, filling orders and hitting stops on the way).
   */
  private tickLive(): void {
    const replay = this.replay();
    const evaluation = this.evaluation();
    if (!replay || evaluation?.pace == null || this.phase() !== 'playing') {
      return;
    }
    const shown = liveMinutes(
      this.serverClock.now() - this.liveStart,
      evaluation.pace,
      evaluation.durationMinutes + this.extraMinutes,
    );
    const target = replay.historyBars - 1 + shown;
    if (replay.cursor() >= target) {
      return;
    }
    if (replay.atEnd() && !replay.hasAllCandles()) {
      void this.loadMinutes();
      return;
    }
    this.advance(replay, () => replay.cursor() < target);
  }

  /**
   * Picks up the newest session the student left open (a reload, a closed tab, another page or
   * another device), so they go on where they were. Evaluation attempts whose time ran out
   * while they were away are closed first, at the bar they were left on.
   */
  private async resumeActive(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    this.phase.set('loading');
    try {
      const open = await this.loadOpen(uid);
      const session = open.find((s) => findInstrument(s.symbol));
      if (session) {
        await this.resume(session);
      }
    } catch {
      this.error.set(this.i18n.messages().practice.resumeFailed);
    }
    if (this.phase() === 'loading') {
      this.phase.set('setup');
    }
  }

  /**
   * The student's open sessions: the last free practice and evaluation attempts with time left.
   * Older free practice and attempts whose time is up are closed where they were left. Keeps
   * them in `openSessions` for the list of practices to go back to.
   */
  private async loadOpen(uid: string): Promise<PracticeSession[]> {
    const sessions = await this.practice.activeSessions(uid, OPEN_SESSIONS_MAX);
    const expired = staleSessions(sessions, this.serverClock.now());
    const open = sessions.filter((s) => !expired.includes(s));
    this.openSessions.set(open);
    this.watchOpen();
    if (expired.length) {
      await Promise.all(expired.map((s) => this.closeLeft(s).catch(() => undefined)));
      this.loadSessions();
      this.loadEvaluations();
    }
    return open;
  }

  /** Reloads the list of open sessions (not the one on screen). */
  private async refreshOpen(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    try {
      await this.loadOpen(uid);
    } catch {
      // The list stays as it was; the page itself still works.
    }
  }

  /**
   * While the list shows open evaluation attempts, counts their time down and closes each one
   * as it runs out.
   */
  private watchOpen(): void {
    clearInterval(this.openClock);
    this.openClock = undefined;
    if (!this.openSessions().some((s) => s.durationMinutes != null)) {
      return;
    }
    this.openClock = setInterval(() => {
      const now = this.serverClock.now();
      this.now.set(now);
      const expired = this.openSessions().filter((s) => attemptTimeUp(s, now));
      if (expired.length) {
        this.openSessions.update((all) => all.filter((s) => !expired.includes(s)));
        void Promise.all(expired.map((s) => this.closeLeft(s).catch(() => undefined))).then(() => {
          this.loadSessions();
          this.loadEvaluations();
        });
      }
    }, 1000);
  }

  /** Goes back to a session the student left open, where they left it. */
  protected async continueSession(session: PracticeSession): Promise<void> {
    if (this.phase() === 'loading') {
      return;
    }
    if (attemptTimeUp(session, this.serverClock.now())) {
      await this.refreshOpen();
      return;
    }
    this.error.set(null);
    this.phase.set('loading');
    try {
      await this.resume(session);
      this.openSessions.update((all) => all.filter((s) => s.id !== session.id));
    } catch {
      this.error.set(this.i18n.messages().practice.resumeFailed);
    }
    if (this.phase() === 'loading') {
      this.phase.set('setup');
    }
  }

  /**
   * Leaves the session on screen open and goes back to the list: it stays where it is (an
   * evaluation's clock keeps running) until the student comes back or closes it.
   */
  protected leaveOpen(): void {
    if (this.phase() !== 'playing') {
      return;
    }
    this.pause();
    this.saveResumeNow();
    clearInterval(this.clock);
    clearInterval(this.liveTimer);
    this.stopFeed();
    this.tabs.close();
    this.stopWatching();
    this.deadline.set(null);
    this.focused.set(null);
    this.evaluation.set(null);
    this.replay.set(null);
    this.realtime.set(false);
    this.sessionId.set(null);
    this.error.set(null);
    this.resumed.set(false);
    this.phase.set('setup');
    this.loadSessions();
    void this.refreshOpen().then(() => this.loadEvaluations());
  }

  /** Closes a session from the list of open ones, without opening it. */
  protected async closeOpen(session: PracticeSession): Promise<void> {
    const t = this.i18n.messages().practice;
    if (this.closing() || !confirm(t.confirmClose)) {
      return;
    }
    this.closing.set(session.id);
    this.error.set(null);
    try {
      await this.closeLeft(session);
      this.openSessions.update((all) => all.filter((s) => s.id !== session.id));
      this.watchOpen();
    } catch {
      this.error.set(t.finishFailed);
    } finally {
      this.closing.set(null);
    }
    this.loadSessions();
    if (session.evaluationId) {
      this.loadEvaluations();
    }
  }

  /**
   * Closes a session that is not on screen as `finish` would have: positions close and orders
   * are cancelled at the bar it was left on, and it is marked finished.
   */
  private async closeLeft(session: PracticeSession): Promise<void> {
    const saved = pickResume(session.resume, readLocalResume(session.id));
    const trades = await this.practice.sessionTrades(session.id);
    const replay = await this.rebuild(session, saved, trades);
    if (session.live) {
      // The market went on while it was left: orders filled and stops hit since are kept.
      const filled: PracticeTrade[] = [];
      const hit: PracticeTrade[] = [];
      while (!replay.atEnd()) {
        const result = replay.step()!;
        filled.push(...result.filled);
        hit.push(...result.closed);
      }
      await Promise.all(filled.map((trade) => this.practice.fillOrder(session.id, trade)));
      await Promise.all(hit.map((trade) => this.practice.closeTrade(session.id, trade)));
    }
    const { cancelled, closed } = replay.closeAll('sessionEnd');
    await Promise.all([
      ...cancelled.map((order) => this.practice.cancelOrder(session.id, order)),
      ...closed.map((trade) => this.practice.closeTrade(session.id, trade)),
    ]);
    await this.practice.finishSession(session.id, this.summary(replay));
    clearLocalResume(session.id);
    void this.notifications.notifyActivity({
      type: session.evaluationId ? 'evaluationFinished' : 'practiceFinished',
      kind: session.evaluationId ? 'evaluation' : 'practice',
      refId: session.id,
      contextId: session.evaluationId ?? null,
      title:
        this.evaluations().find((card) => card.evaluation.id === session.evaluationId)?.evaluation
          .title ?? '',
    });
  }

  /** A session's replay with its trades, at the bar it was left on. */
  private async rebuild(
    session: PracticeSession,
    saved: SessionResume | null,
    trades: PracticeTrade[],
  ): Promise<Replay> {
    if (session.live) {
      return this.rebuildLive(session, saved, trades);
    }
    const minutes = await this.market.loadCandles(
      session.symbol,
      '1m',
      session.replayStart - MINUTE,
    );
    if (minutes.length < MIN_REPLAY_MINUTES) {
      throw new Error('Not enough data');
    }
    const replay = new Replay(minutes, 1, session.startingBalance, true);
    if (minutes.length < REPLAY_BARS) {
      replay.extend([], true);
    }
    const time = resumeTime(session.replayStart, saved, trades);
    while (!replay.hasAllCandles() && replay.candles.at(-1)!.time < time) {
      await this.fetchMinutes(replay, session.symbol, session.replayStart);
    }
    replay.resume(trades, time);
    return replay;
  }

  /**
   * A live session's replay from the 4-hour bar it was left in up to now, at the minute it was
   * left on: the page then settles what happened since, as a broker would have.
   */
  private async rebuildLive(
    session: PracticeSession,
    saved: SessionResume | null,
    trades: PracticeTrade[],
  ): Promise<Replay> {
    const time = resumeTime(session.replayStart, saved, trades);
    const minutes = await this.market.loadMinutesSince(
      session.symbol,
      chartAnchor(time * 1000) - MINUTE,
    );
    if (minutes.length < 2) {
      throw new Error('Not enough data');
    }
    const replay = new Replay(minutes, 1, session.startingBalance, true);
    replay.resume(trades, time);
    return replay;
  }

  /**
   * Rebuilds a session as it was left: its trades, the bar it was on, the timeframe, speed,
   * drawings and, for an evaluation, the time left. The replay waits paused.
   */
  private async resume(session: PracticeSession): Promise<void> {
    const evaluation = session.evaluationId
      ? await this.evaluationService.get(session.evaluationId).catch(() => null)
      : null;
    if (session.evaluationId) {
      await this.serverClock.sync();
    }
    const saved = pickResume(session.resume, readLocalResume(session.id));
    const timeframe = TIMEFRAMES.find((tf) => tf.interval === saved?.interval) ?? DEFAULT_TIMEFRAME;
    const live = session.live === true;
    let trades: PracticeTrade[];
    let history: Candle[];
    let anchor = session.replayStart;
    if (live) {
      trades = await this.practice.sessionTrades(session.id);
      anchor = chartAnchor(resumeTime(session.replayStart, saved, trades) * 1000);
      history = await this.loadHistory(session.symbol, timeframe, anchor);
    } else {
      [trades, history] = await Promise.all([
        this.practice.sessionTrades(session.id),
        this.loadHistory(session.symbol, timeframe, session.replayStart),
      ]);
    }
    const replay = await this.rebuild(session, saved, trades);
    this.symbol.set(session.symbol);
    this.hideDates.set(live ? false : (evaluation?.hideDates ?? saved?.hideDates ?? true));
    if (saved && SPEEDS.includes(saved.speed)) {
      this.speed.set(saved.speed);
    }
    this.enter(
      session.id,
      replay,
      anchor,
      timeframe,
      history,
      evaluation,
      (saved?.drawings ?? []) as Drawing[],
      live,
    );
    if (live) {
      // Live: what the market did while the student was away, up to now.
      this.advance(replay, () => true);
    }
    this.openSessions.update((all) => all.filter((s) => s.id !== session.id));
    this.resumed.set(true);
    const deadline = attemptDeadline(session);
    this.extraMinutes = session.extraMinutes ?? 0;
    if (evaluation && session.startedAt) {
      this.startLive(evaluation, session.startedAt.toMillis());
    }
    if (deadline !== null) {
      this.startClock(deadline);
      this.watchAttempt(
        session.id,
        session.startedAt?.toMillis() ?? 0,
        session.durationMinutes ?? 0,
      );
    }
    if (replay.finished()) {
      void this.finish();
    }
  }

  /**
   * Keeps where the session is: in this browser at once, in Firestore a little later (sooner
   * when more than the bar changed), so reloads and other devices pick it up there.
   */
  private keepResume(state: SessionResume): void {
    const sessionId = this.sessionId();
    if (!sessionId) {
      return;
    }
    writeLocalResume(sessionId, state);
    const previous = this.lastResume;
    this.lastResume = state;
    if (!previous) {
      return;
    }
    const onlyMoved =
      previous.interval === state.interval &&
      previous.speed === state.speed &&
      previous.hideDates === state.hideDates &&
      previous.drawings === state.drawings;
    this.resumeSaved = false;
    if (onlyMoved && this.realtime()) {
      // Live, the minute moves by itself for hours: it is saved when the page goes away (and
      // with the trades, which say where it was too), not every few seconds of the day's quota.
      return;
    }
    const due = Date.now() + (onlyMoved ? RESUME_SAVE_MS : RESUME_CHANGE_MS);
    if (this.resumeTimer && this.resumeDue <= due) {
      return;
    }
    clearTimeout(this.resumeTimer);
    this.resumeDue = due;
    this.resumeTimer = setTimeout(() => this.saveResumeNow(), due - Date.now());
  }

  /** Saves where the session is to Firestore now (on pause, or as the page goes away). */
  protected saveResumeNow(): void {
    clearTimeout(this.resumeTimer);
    this.resumeTimer = undefined;
    const sessionId = this.sessionId();
    const state = this.lastResume;
    if (this.resumeSaved || !sessionId || !state || this.phase() !== 'playing') {
      return;
    }
    this.resumeSaved = true;
    // Best effort: this browser has its own copy, and trades are logged as they happen.
    this.practice.saveResume(sessionId, state).catch(() => (this.resumeSaved = false));
  }

  /** Counts the attempt's time down and finishes it when it runs out. */
  private startClock(deadline: number): void {
    this.deadline.set(deadline);
    this.now.set(this.serverClock.now());
    // Warnings already past (on resuming, or with minutes added) are not given again.
    this.warned = new Set(TIME_WARNINGS.filter((m) => deadline - this.now() <= m * MINUTE));
    this.timeWarning.set(null);
    clearInterval(this.clock);
    this.clock = setInterval(() => {
      this.now.set(this.serverClock.now());
      this.warnTime(deadline - this.now());
      if (this.now() >= deadline) {
        // A live attempt shows its last candles before it closes.
        this.tickLive();
        void this.finish();
      }
    }, 1000);
  }

  /** Warns once when 5 minutes and then 1 minute are left, and buzzes a phone. */
  private warnTime(left: number): void {
    const due = TIME_WARNINGS.filter((m) => left <= m * MINUTE && !this.warned.has(m));
    if (!due.length || left <= 0) {
      return;
    }
    due.forEach((m) => this.warned.add(m));
    const t = this.i18n.messages().practice;
    this.timeWarning.set(Math.min(...due) === 1 ? t.warnOne : t.warnFive);
    navigator.vibrate?.(200);
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
    if (!replay || this.phase() !== 'playing' || this.clockDriven()) {
      return;
    }
    this.resumed.set(false);
    const end = nextBarEnd(replay.current().time, this.barSeconds());
    if (replay.candles.at(-1)!.time < end && !replay.hasAllCandles()) {
      void this.loadMinutes();
      return;
    }
    this.advance(replay, () => replay.current().time < end);
  }

  /**
   * Moves the replay a minute at a time while `more` holds (and candles are loaded), saving
   * the orders filled and trades closed on the way; ends the session after the last candle.
   */
  private advance(replay: Replay, more: () => boolean): void {
    const closed: PracticeTrade[] = [];
    const filled: PracticeTrade[] = [];
    while (!replay.atEnd() && more()) {
      const result = replay.step()!;
      closed.push(...result.closed);
      filled.push(...result.filled);
    }
    this.record(replay, filled, closed);
    if (replay.finished()) {
      void this.finish();
    } else if (replay.candles.length - 1 - replay.cursor() < PREFETCH_MINUTES) {
      void this.loadMinutes();
    }
  }

  /** Saves the orders filled and the trades closed by the candles just shown. */
  private record(replay: Replay, filled: PracticeTrade[], closed: PracticeTrade[]): void {
    // Fills go first: an order can fill and close within the same bar.
    filled.forEach((trade) => this.persist((id) => this.practice.fillOrder(id, trade)));
    closed.forEach((trade) => this.persistClose(trade));
    if (filled.length && !closed.length) {
      this.persist((sessionId) => this.practice.updateSummary(sessionId, this.summary(replay)));
    }
  }

  protected togglePlay(): void {
    if (this.clockDriven()) {
      return;
    }
    if (this.playing()) {
      this.pause();
      this.saveResumeNow();
    } else {
      this.play();
    }
  }

  protected setSpeed(speed: number): void {
    if (this.clockDriven()) {
      return;
    }
    this.speed.set(speed);
    if (this.playing()) {
      this.pause();
      this.play();
    }
  }

  /** Places the order set up in the ticket. */
  protected async openTrade(): Promise<void> {
    if (this.editing()) {
      this.saveEdit();
      return;
    }
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
    const warnings = this.warningsFor({
      side,
      entry: this.replay()?.current().close ?? 0,
      stopLoss: null,
      units: this.units(),
    });
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
      if (warnings.length) {
        this.showQuickError(warnings.map((w) => this.warningText(w)).join(' '), true);
      }
    }
  }

  /** The warnings for an order about to be sent, while a session is being played. */
  private warningsFor(order: WarnedOrder): OrderWarning[] {
    const replay = this.replay();
    if (!replay || this.phase() !== 'playing') {
      return [];
    }
    return orderWarnings(order, replay.balance(), replay.closedTrades(), replay.current().time);
  }

  /** A warning in words; in an evaluation it also says it costs points. */
  protected warningText(warning: OrderWarning): string {
    const t = this.i18n.messages().practice.orderWarnings;
    const percent = (value: number) => formatPercent(value, this.locale, '1.0-1');
    const text =
      warning.kind === 'risk'
        ? t.risk(percent(warning.pct), percent(RISK_ALLOWED))
        : warning.kind === 'noStop'
          ? t.noStop
          : t.flip;
    return this.evaluation() ? `${text} ${t.costsPoints}` : text;
  }

  /**
   * The one-click box sits on the chart, far from the ticket on a phone: its refusals show
   * right under it, until the next try or a few seconds later.
   */
  private showQuickError(message: string | null, warn = false): void {
    clearTimeout(this.quickErrorTimer);
    this.quickError.set(message);
    this.quickWarn.set(warn);
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
      // Its journal entry is next: why it was entered.
      this.journalFocus.set(trade.id);
      return trade;
    } catch {
      replay.discard(trade.id);
      report(this.i18n.messages().practice.saveTradeFailed);
      return null;
    } finally {
      this.placing.set(false);
    }
  }

  /** Saves why a trade was entered (its journal entry); allowed until the session ends. */
  protected saveJournal(trade: PracticeTrade, journal: string): void {
    const replay = this.replay();
    if (!replay) {
      return;
    }
    let annotated: PracticeTrade;
    try {
      annotated = replay.annotate(trade.id, journal);
    } catch {
      return;
    }
    this.persist((id) => this.practice.saveJournal(id, annotated), trade);
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

  /**
   * The take profit / stop loss checkboxes: on adds the level at a default distance (from the
   * market for a position being edited, so it is on the right side of the price).
   */
  protected toggleLevel(field: LevelField, on: boolean): void {
    this.drafting.set(true);
    const current = this.replay()?.current().close;
    if (!on || current === undefined) {
      this[field].set(null);
      return;
    }
    const from = this.editingOpen() ? current : this.reference();
    this[field].set(defaultLevel(this.side(), field, from));
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

  /** A placed order's or position's lines moved on the chart and confirmed with their ✓. */
  protected onLevelsMoved({ target, levels }: LevelsMove): void {
    const trade = this.replay()
      ?.trades()
      .find((t) => t.id === target);
    if (trade) {
      this.changeTrade(trade, {
        stopLoss: levels.stopLoss ?? trade.stopLoss,
        takeProfit: levels.takeProfit ?? trade.takeProfit,
        orderPrice: levels.price ?? trade.orderPrice,
      });
    }
  }

  /** Changes a placed order or position; false (and says why) if the change is refused. */
  private changeTrade(trade: PracticeTrade, levels: TradeLevels): boolean {
    const replay = this.replay();
    if (!replay) {
      return false;
    }
    try {
      const updated = replay.modify(trade.id, levels, this.i18n.messages().orderErrors);
      this.persist((id) => this.practice.updateLevels(id, updated), trade);
      this.orderError.set(null);
      return true;
    } catch (e) {
      this.orderError.set((e as Error).message);
      return false;
    }
  }

  /**
   * "Editar" on a position or pending order: loads it into the ticket, which then saves the
   * changes to it instead of placing a new order. Its lines stay on the chart as they are
   * until the changes are saved.
   */
  protected startEdit(trade: PracticeTrade, ticket?: HTMLElement): void {
    if (trade.status !== 'pending' && trade.status !== 'open') {
      return;
    }
    if (!this.editing()) {
      this.ticketBeforeEdit = {
        side: this.side(),
        orderType: this.orderType(),
        orderPrice: this.orderPrice(),
        lots: this.lots(),
        stopLoss: this.stopLoss(),
        takeProfit: this.takeProfit(),
        drafting: this.drafting(),
      };
    }
    this.editing.set({ id: trade.id, status: trade.status });
    this.side.set(trade.side);
    this.orderType.set(trade.orderType);
    this.orderPrice.set(trade.status === 'pending' ? trade.orderPrice : null);
    this.lots.set(tradeLots(trade));
    this.stopLoss.set(trade.stopLoss);
    this.takeProfit.set(trade.takeProfit);
    this.orderError.set(null);
    ticket?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  /** Saves the ticket's changes to the order or position being edited. */
  protected saveEdit(): void {
    const trade = this.editingTrade();
    if (!trade) {
      return;
    }
    const pending = trade.status === 'pending';
    if (pending && this.orderPrice() === null) {
      this.orderError.set(this.i18n.messages().orderErrors.priceRequired);
      return;
    }
    const saved = this.changeTrade(trade, {
      stopLoss: this.stopLoss(),
      takeProfit: this.takeProfit(),
      orderPrice: pending ? this.orderPrice() : trade.orderPrice,
      ...(pending ? { lots: this.lots() } : {}),
    });
    if (saved) {
      this.stopEditing();
    }
  }

  /** Leaves the edit and puts the ticket back as it was; `message` says why, if it ended. */
  protected stopEditing(message: string | null = null): void {
    const before = this.ticketBeforeEdit;
    this.editing.set(null);
    this.ticketBeforeEdit = null;
    if (before) {
      this.side.set(before.side);
      this.orderType.set(before.orderType);
      this.orderPrice.set(before.orderPrice);
      this.lots.set(before.lots);
      this.stopLoss.set(before.stopLoss);
      this.takeProfit.set(before.takeProfit);
      this.drafting.set(before.drafting);
    }
    this.orderError.set(message);
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
    clearInterval(this.liveTimer);
    this.stopFeed();
    this.tabs.close();
    this.stopWatching();
    clearTimeout(this.resumeTimer);
    clearLocalResume(sessionId);
    this.deadline.set(null);
    this.phase.set('finished');
    // Kept here: "Nueva práctica" can clear it while the writes below are still going.
    const evaluation = this.evaluation();
    const { cancelled, closed } = replay.closeAll('sessionEnd');
    const last = this.lastResume;
    const unsaved = !this.resumeSaved;
    try {
      // The drawings stay with the session for its review (Cris, 2026-11-11): the last ones
      // are saved before it is marked finished. Best effort, as while it ran.
      if (last && unsaved) {
        await this.practice.saveResume(sessionId, last).catch(() => undefined);
      }
      await Promise.all([
        ...cancelled.map((order) => this.practice.cancelOrder(sessionId, order)),
        ...closed.map((trade) => this.practice.closeTrade(sessionId, trade)),
      ]);
      await this.practice.finishSession(sessionId, this.summary(replay));
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
    if (evaluation) {
      this.loadEvaluations();
    }
  }

  protected reset(): void {
    this.realtime.set(false);
    this.focused.set(null);
    this.evaluation.set(null);
    this.replay.set(null);
    this.sessionId.set(null);
    this.error.set(null);
    this.phase.set('setup');
    void this.refreshOpen();
  }

  /** A finished attempt keeps its dates hidden from students until its window closes. */
  protected reviewHidesDates(session: PracticeSession): boolean {
    if (!session.evaluationId || this.auth.isStaff()) {
      return false;
    }
    const card = this.evaluations().find((c) => c.evaluation.id === session.evaluationId);
    return datesLocked(card?.evaluation ?? null, this.now());
  }

  /** An evaluation attempt the student left open, to go back to from its card. */
  protected openAttempt(card: EvaluationCard): PracticeSession | null {
    const attempt = card.attempt;
    return attempt?.status === 'active' && !attemptTimeUp(attempt, this.now()) ? attempt : null;
  }

  /** The time an open evaluation attempt has left, or null for free practice. */
  protected openTimeLeft(session: PracticeSession): string | null {
    const deadline = attemptDeadline(session);
    return deadline === null ? null : formatCountdown(deadline - this.now());
  }

  protected evaluationTitle(session: PracticeSession): string {
    return (
      this.evaluations().find((card) => card.evaluation.id === session.evaluationId)?.evaluation
        .title ?? ''
    );
  }

  protected shownStatus(session: PracticeSession): PracticeSession['status'] {
    return shownStatus(session, this.now());
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
    if (this.editing()) {
      this.stopEditing();
    }
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
    if (event.key === 'ArrowRight' && !typing && !this.clockDriven()) {
      event.preventDefault();
      this.step();
    }
  }

  /** Fetches the next chunk of one-minute candles, up to `REPLAY_DAYS` after the start. */
  private async loadMinutes(): Promise<void> {
    const replay = this.replay();
    if (!replay || this.loadingMinutes || replay.hasAllCandles() || this.realtime()) {
      return;
    }
    this.loadingMinutes = true;
    try {
      await this.fetchMinutes(replay, this.symbol(), this.replayStart(), true);
    } catch {
      this.pause();
      this.error.set(this.i18n.messages().practice.moreBarsFailed);
    } finally {
      this.loadingMinutes = false;
    }
  }

  /** Appends the next chunk of one-minute candles, up to `REPLAY_DAYS` after the start. */
  private async fetchMinutes(
    replay: Replay,
    symbol: string,
    replayStart: number,
    background = false,
  ): Promise<void> {
    const from = (replay.candles.at(-1)!.time + 60) * 1000;
    const limit = replayStart + REPLAY_DAYS * 24 * 60 * MINUTE;
    const more = await this.market.loadCandles(symbol, '1m', from, REPLAY_BARS, { background });
    const within = more.filter((c) => c.time * 1000 < limit);
    replay.extend(within, more.length < REPLAY_BARS || within.length < more.length);
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
      const now = this.serverClock.now();
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

/** Whether two saved positions are the same (a live minute's new price is not a move). */
function sameResume(a: SessionResume | null, b: SessionResume | null): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.time === b.time &&
      a.interval === b.interval &&
      a.hideDates === b.hideDates &&
      a.speed === b.speed &&
      a.drawings === b.drawings)
  );
}

/** A stop loss or take profit at the default distance from `reference`, on the right side. */
function defaultLevel(side: TradeSide, field: LevelField, reference: number): number {
  const direction = (side === 'long' ? 1 : -1) * (field === 'stopLoss' ? -1 : 1);
  const offset = field === 'stopLoss' ? DEFAULT_STOP_OFFSET : DEFAULT_TARGET_OFFSET;
  return roundPrice(reference * (1 + direction * offset));
}
