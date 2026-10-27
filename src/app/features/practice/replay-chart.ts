import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  AutoscaleInfo,
  CandlestickSeries,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineSeries,
  LineStyle,
  Logical,
  SeriesMarker,
  Time,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import { I18n } from '../../core/i18n/i18n.service';
import { ThemeService } from '../../core/theme/theme.service';
import { Candle, OrderType, PracticeTrade, TradeSide } from '../../core/models/practice';
import { DEFAULT_INDICATORS, INDICATORS, RSI_LEVELS, computeIndicator } from './indicators';
import { formatLots, priceDecimals, priceDigits, roundPrice, signedMoney } from './practice-format';
import { LOT_SIZE, LOT_STEP, tradeLots } from './replay';
import { filledTrades, tradeBox } from './trade-boxes';

/** The order being set up in the ticket, drawn as draggable lines before it is placed. */
export interface OrderDraft {
  side: TradeSide;
  orderType: OrderType;
  price: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Units the order would buy or sell, to label the SL/TP lines with their P/L. */
  quantity?: number;
  /** Why the order cannot be placed as it is; its button is then off and a "!" says why. */
  error?: string | null;
}

export type LevelField = 'price' | 'stopLoss' | 'takeProfit';

/** A line dragged to a new price: on the draft (`target: 'draft'`) or on a trade (its id). */
export interface LevelMove {
  target: string;
  field: LevelField;
  price: number;
}

/**
 * The × of a stop loss or take profit label, or the level dragged back onto its entry; also a
 * click on a TP/SL tab, which asks for that level at its default distance.
 */
export interface LevelRemove {
  target: string;
  field: 'stopLoss' | 'takeProfit';
}

type ExitField = LevelRemove['field'];

type LabelAction =
  | { kind: 'close'; tradeId: string; label: string }
  | { kind: 'remove'; level: LevelRemove; label: string }
  | { kind: 'erase'; drawingId: number; label: string }
  | { kind: 'discard'; label: string };

/** The box on a line, as TradingView draws it: text, P/L and a × button. */
interface LineLabel {
  /** The side, at the start of the box; on the order being set up, a button that places it. */
  badge?: { text: string; side: TradeSide; submit: boolean };
  /** Lots of the order being set up: a button that opens the quantity pad. */
  lots?: number;
  /** The text is the order type, a button that opens the order type menu. */
  typeMenu?: boolean;
  /** Why the order being set up cannot be placed. */
  warning?: string;
  /** TP and SL tabs for the levels the line does not have yet: drag one out, or click it. */
  tabs?: { bracket: Bracket; fields: ExitField[] };
  text: string;
  /** P/L if the price reaches the line (or, for a position, at the last close). */
  pnl: number | null;
  action: LabelAction | null;
}

/** The entry of a position or of the order being set up: dragging away from it adds a TP/SL. */
interface Bracket {
  target: string;
  side: TradeSide;
  quantity?: number;
}

/** An order picked from the "+" menu, at the price where it was opened, to be set up. */
export interface OrderAt {
  side: TradeSide;
  orderType: Exclude<OrderType, 'market'>;
  price: number;
}

/** The shaded band between the entry of the order being set up and its TP or SL. */
interface Zone {
  key: string;
  top: number;
  height: number;
  profit: boolean;
}

interface Line {
  key: string;
  price: number;
  color: string;
  style: LineStyle;
  /** Set when the line can be dragged. */
  drag?: { target: string; field: LevelField };
  label?: LineLabel;
  /** An open position, whose label P/L follows the last close. */
  position?: PracticeTrade;
  /** P/L at a price, so the label follows the line while it is dragged. */
  pnlAt?: (price: number) => number;
  bracket?: Bracket;
  /** The market order being set up, which sits on the last close. */
  atClose?: boolean;
  /** A TP/SL line's entry: dropping the line back on it removes the level. */
  entry?: () => number | null;
}

interface PlacedLabel extends LineLabel {
  key: string;
  color: string;
  y: number;
  line: Line;
}

export type Tool =
  | 'trend'
  | 'ray'
  | 'extended'
  | 'arrow'
  | 'hline'
  | 'hray'
  | 'vline'
  | 'channel'
  | 'rect'
  | 'fib'
  | 'long'
  | 'short'
  | 'range';
/** Drawings on the overlay: every tool but the horizontal line, which is a price line. */
type ShapeKind = Exclude<Tool, 'hline'>;
interface ShapeDrawing {
  id: number;
  kind: ShapeKind;
  /** One point (horizontal ray, vertical line) or two: the ends, corners or move. */
  points: ChartPoint[];
  color: string;
  /** Parallel channel: how far (price) its parallel line is from the first one. */
  offset?: number;
  /** Long/short position: the stop loss; the target is the second point's price. */
  stop?: number;
}
type Drawing = { id: number; kind: 'hline'; price: number } | ShapeDrawing;
interface ChartPoint {
  time: number;
  price: number;
}
interface Pixel {
  x: number;
  y: number;
}

/**
 * A dot on the selected drawing. Dragging it moves the time (x) of point `timeOf` and the price
 * (y) of point `priceOf`: both for the ends of a line, one of them for a rectangle's sides. A
 * `level` handle moves a channel's parallel line or a position's stop loss instead.
 */
interface Handle {
  key: string;
  x: number;
  y: number;
  timeOf: number | null;
  priceOf: number | null;
  level?: 'offset' | 'stop';
}

/** A drawing of the overlay, in pixels. */
interface PlacedShape {
  id: number;
  kind: ShapeKind;
  color: string;
  /** The drawing's points. */
  pixels: Pixel[];
  a: Pixel;
  b: Pixel;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** The line drawn: from `a` to `b`, past them for rays and extended lines. */
  segment: [Pixel, Pixel];
  /** A channel's parallel line. */
  parallel?: [Pixel, Pixel];
  /** An arrow's head, as SVG polygon points. */
  head?: string;
  /** Fibonacci levels: their ratio, price, height and own color (else the drawing's). */
  levels: { ratio: number; price: number; y: number; color: string | null }[];
  /** Long/short position: its entry, target (profit) and stop (loss) bands, and labels. */
  position?: {
    entryY: number;
    profit: { top: number; height: number };
    loss: { top: number; height: number };
    labels: { key: string; y: number; up: boolean; text: string }[];
    ratio: string;
  };
  /** Price range: its label, where it goes and whether the price went up. */
  range?: { text: string; y: number; up: boolean };
  handles: Handle[];
}

/** A trade drawn as TradingView's long/short position box, in pixels of the candles' pane. */
interface PlacedBox {
  id: string;
  left: number;
  right: number;
  entryY: number;
  profit: { top: number; height: number } | null;
  loss: { top: number; height: number } | null;
  /** Where the trade closed, joined to the entry by a dashed line; null while open. */
  exit: Pixel | null;
  focused: boolean;
  pnl: number | null;
}

/** A press on the chart that is about drawings: placing a point, editing one, or a tap. */
interface Gesture {
  pointerId: number;
  start: Pixel;
  touch: boolean;
  moved: boolean;
  /** Placing a point: where the cursor was as the press started; whether a point was set. */
  place?: { from: Pixel; anchored: boolean };
  /** Moving a drawing by one of its handles, or whole when there is none. */
  edit?: { drawing: ShapeDrawing; from: Pixel[]; handle: Handle | null };
  /** A tap selects this drawing, or none. */
  select?: number | null;
}

/** Lot shortcuts of the quantity pad. */
export const LOT_PRESETS = [0.01, 0.05, 0.1, 0.5, 1];

const FIB_RED = '#f23645';
const FIB_PURPLE = '#9c27b0';
/**
 * Retracement levels and colors Cris uses in TradingView (2026-10-26); a level without a color
 * takes the drawing's. Ordered from the end of the move (0) past its start (1) and beyond.
 */
export const FIB_LEVELS: { ratio: number; color: string | null }[] = [
  { ratio: -1, color: FIB_RED },
  { ratio: -0.618, color: FIB_PURPLE },
  { ratio: -0.5, color: FIB_PURPLE },
  { ratio: -0.27, color: '#5e35b1' },
  { ratio: 0, color: null },
  { ratio: 0.236, color: null },
  { ratio: 0.382, color: null },
  { ratio: 0.5, color: null },
  { ratio: 0.618, color: FIB_RED },
  { ratio: 0.71, color: FIB_RED },
  { ratio: 0.786, color: FIB_RED },
  { ratio: 0.81, color: '#7b1fa2' },
  { ratio: 1, color: null },
  { ratio: 1.12, color: null },
  { ratio: 1.1618, color: null },
  { ratio: 1.272, color: null },
  { ratio: 2.618, color: FIB_RED },
  { ratio: 3.272, color: '#787b86' },
  { ratio: 4.236, color: FIB_RED },
];

/** How close (px) the pointer must be to a line to grab it; a finger needs more room. */
const GRAB_DISTANCE = 6;
const TOUCH_GRAB_DISTANCE = 16;
/** How far (px) a press moves before it is a drag rather than a tap. */
const TAP_SLOP = 4;
const TOUCH_TAP_SLOP = 8;
/** Colors offered for drawings, the first one by default (TradingView's palette). */
export const DRAWING_COLORS = ['#2962ff', '#f23645', '#089981', '#ff9800', '#9c27b0'];
const DRAWING_COLOR = DRAWING_COLORS[0];
/** Id of the drawing shown while its second point is being placed. */
const PREVIEW_ID = 0;
const RSI_PANE_HEIGHT = 110;
/** Fewest bars a finished replay is shown across, so a short one keeps some history. */
const MIN_REPLAY_VIEW = 60;
/** Length (px) of an arrow's head. */
const ARROW_HEAD = 12;

export type ToolGroup = 'lines' | 'shapes' | 'fibonacci' | 'projection';
/** The drawings menu, in sections as TradingView groups its tools. */
export const TOOL_GROUPS: { group: ToolGroup; tools: Tool[] }[] = [
  { group: 'lines', tools: ['trend', 'ray', 'extended', 'arrow', 'hline', 'hray', 'vline'] },
  { group: 'shapes', tools: ['channel', 'rect'] },
  { group: 'fibonacci', tools: ['fib'] },
  { group: 'projection', tools: ['long', 'short', 'range'] },
];

/** Points a drawing takes: a channel's third sets its width. */
const POINTS: Record<Tool, number> = {
  trend: 2,
  ray: 2,
  extended: 2,
  arrow: 2,
  hline: 1,
  hray: 1,
  vline: 1,
  channel: 3,
  rect: 2,
  fib: 2,
  long: 2,
  short: 2,
  range: 2,
};

/** Drawings whose two points must be on different bars, as they are lines through them. */
const LINE_KINDS: ReadonlySet<Tool> = new Set([
  'trend',
  'ray',
  'extended',
  'arrow',
  'channel',
  'long',
  'short',
]);

const DECIMALS = new Map<number, Intl.NumberFormat>();
/** A price distance with the decimals of `price`, in en-US numbers as prices are. */
function formatDistance(value: number, price: number, signed = false): string {
  const digits = priceDecimals(price);
  const key = digits * 2 + Number(signed);
  let format = DECIMALS.get(key);
  if (!format) {
    format = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: signed ? 'exceptZero' : 'auto',
    });
    DECIMALS.set(key, format);
  }
  return format.format(value);
}

/** A share of a price as a percentage with two decimals: "0.48%". */
function formatPercent(value: number, of: number, signed = false): string {
  const pct = of ? (value / of) * 100 : 0;
  return `${signed && pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

/**
 * Candlestick chart for the replay (TradingView lightweight-charts, Apache-2.0), laid out like
 * TradingView. It draws the visible candles, a marker per entry and exit, and lines for the
 * order being set up, pending orders and open positions, each with a label showing its size and
 * P/L and a × to close the position, cancel the order or remove the SL/TP. Order prices, stop
 * losses and take profits can be dragged by the line or its label; each drop emits
 * `levelMoved` and the page decides whether to accept it. Dropping a TP/SL back on its entry
 * removes it.
 *
 * Orders are set up as in TradingView: nothing is on the chart until the student picks an order
 * from the "+" menu next to the price scale. The order's line then has its Buy/Sell button, a
 * quantity pad, an order type menu, TP/SL tabs to drag out and a × to discard it.
 *
 * A toolbar on top (content marked `chartToolbar`, such as the timeframes, goes first) has a
 * menu of indicators (EMA 100 and 200, on from the start, and the RSI in its own pane) and one
 * of drawings, in TradingView's sections (`TOOL_GROUPS`): lines, rays and arrows, parallel
 * channels and rectangles, Fibonacci retracements, long/short positions and price ranges.
 * Indicators only use the candles shown, so they never peek ahead.
 *
 * Drawings work as in TradingView's app: a click or tap puts each point, and on a phone the
 * finger can also drag a crosshair to the point and let go, so it does not hide the spot. A
 * drawing being placed follows the cursor. A tap selects a drawing: its handles adjust it, a
 * drag moves it, and a bar recolors or deletes it.
 */
@Component({
  selector: 'app-replay-chart',
  imports: [DecimalPipe, NgTemplateOutlet],
  host: {
    '[class.drawing]': '!!tool()',
    '(document:pointerdown)': 'closeMenu($event)',
    '(document:keydown)': 'onKey($event)',
  },
  templateUrl: './replay-chart.html',
  styleUrls: ['./replay-chart.scss', './chart-tools.scss'],
})
export class ReplayChart {
  readonly candles = input.required<Candle[]>();
  readonly trades = input<PracticeTrade[]>([]);
  readonly draft = input<OrderDraft | null>(null);
  /** Hides dates on the time axis and crosshair so students cannot look up what comes next. */
  readonly hideDates = input(false);
  /** Shows the indicators and drawing toolbar. */
  readonly tools = input(true);
  /** A live practice: the "+" menu offers orders. */
  readonly trading = input(false);
  /** Length of a bar in seconds: trade markers and drawings snap to the bar they fall in. */
  readonly barSeconds = input(0);
  /**
   * Draws each filled trade as TradingView's long/short position box (entry to TP in green,
   * entry to SL in red, from the entry bar to the exit bar). In a live practice only closed
   * trades get one: open positions have their lines.
   */
  readonly positionBoxes = input(true);
  /** A trade to scroll to, fit in the price scale and highlight. */
  readonly focusTrade = input<string | null>(null);
  /** Time (seconds) the replay started at, marked with a dotted line once it is over. */
  readonly startTime = input<number | null>(null);
  readonly levelMoved = output<LevelMove>();
  readonly levelRemoved = output<LevelRemove>();
  /** The × of a position (close it) or pending order (cancel it). */
  readonly tradeClosed = output<string>();
  /** The side button on the line of the order being set up. */
  readonly draftSubmitted = output<void>();
  /** Lots picked on the quantity pad of the order being set up. */
  readonly lotsChanged = output<string>();
  /** Order type picked on the line of the order being set up. */
  readonly draftTypeChanged = output<OrderType>();
  /** The × of the order being set up. */
  readonly draftDiscarded = output<void>();
  /** A TP/SL tab clicked without dragging: add that level at its default distance. */
  readonly levelAdded = output<LevelRemove>();
  readonly orderAt = output<OrderAt>();
  /** Symbol named in the "+" menu. */
  readonly symbol = input('');

  protected readonly i18n = inject(I18n);
  private readonly theme = inject(ThemeService);
  protected readonly indicators = INDICATORS;
  protected readonly signed = signedMoney;
  protected readonly priceDigits = priceDigits;
  protected readonly formatLots = formatLots;
  protected readonly lotPresets = LOT_PRESETS;
  protected readonly orderTypes: OrderType[] = ['market', 'limit', 'stop'];
  protected readonly active = signal<ReadonlySet<string>>(new Set(DEFAULT_INDICATORS));
  protected readonly toolGroups = TOOL_GROUPS;
  protected readonly drawingColors = DRAWING_COLORS;
  protected readonly tool = signal<Tool | null>(null);
  /** Points put so far of a drawing being placed. */
  protected readonly anchors = signal<ChartPoint[]>([]);
  /** Where the next point goes while a tool is on; `touch` shows it as a crosshair. */
  protected readonly cursor = signal<(Pixel & { touch: boolean }) | null>(null);
  protected readonly drawings = signal<Drawing[]>([]);
  /** The drawing whose handles and bar are shown. */
  protected readonly selected = signal<number | null>(null);
  /** The selected drawing while it is being dragged, until it is dropped. */
  private readonly editing = signal<ShapeDrawing | null>(null);
  /** The indicators or drawings menu of the toolbar, open below its button. */
  protected readonly toolMenu = signal<{
    kind: 'indicators' | 'drawings';
    left: number | null;
    right: number | null;
    top: number;
  } | null>(null);
  protected readonly labels = signal<PlacedLabel[]>([]);
  protected readonly shapes = signal<PlacedShape[]>([]);
  protected readonly selectedShape = computed(() =>
    this.shapes().find((s) => s.id === this.selected() && s.id !== PREVIEW_ID),
  );
  /** What to do next with the tool that is on. */
  protected readonly hint = computed(() => {
    const tool = this.tool();
    const hints = tool ? this.i18n.messages().chart.hints[tool] : [];
    return hints[Math.min(this.anchors().length, hints.length - 1)] ?? '';
  });
  /** Price at the touch crosshair, for its tag on the price scale. */
  protected readonly cursorPrice = computed(() => {
    const cursor = this.cursor();
    this.shapes();
    const price = cursor?.touch ? this.series?.coordinateToPrice(cursor.y) : null;
    return price ? roundPrice(price) : null;
  });
  protected readonly zones = signal<Zone[]>([]);
  protected readonly boxes = signal<PlacedBox[]>([]);
  /** X of the replay start line, between the last bar of history and the first replayed. */
  protected readonly startX = signal<number | null>(null);
  /** Size of the candles' pane, which clips the position boxes. */
  protected readonly paneSize = signal({ width: 0, height: 0 });
  /** The quantity pad or order type menu of the order being set up. */
  protected readonly popup = signal<'lots' | 'type' | null>(null);
  /** The label of the order being set up, where its popups open. */
  protected readonly draftLabel = computed(() => this.labels().find((l) => l.badge?.submit));
  /** Height of the pointer over the candles, where the "+" button sits. */
  protected readonly hoverY = signal<number | null>(null);
  /** The "+" menu, open at a price. */
  protected readonly menu = signal<{ y: number; price: number } | null>(null);
  protected readonly menuOrders = computed(() => {
    const menu = this.menu();
    const close = this.drawnClose();
    if (!menu || close === null) {
      return [];
    }
    const lots = formatLots(this.lots());
    const tr = this.i18n.messages().trading;
    const below = menu.price < close;
    return (['long', 'short'] as const).map((side) => {
      const orderType: OrderAt['orderType'] = (side === 'long') === below ? 'limit' : 'stop';
      return {
        side,
        orderType,
        text: `${side === 'long' ? tr.buy : tr.sell} ${lots} ${this.symbol()} @`,
        type: tr.orderTypes[orderType].toLowerCase(),
      };
    });
  });
  /** Lots of the order panel, which new orders from the menu start with. */
  readonly lots = input(0.01);
  /** The last close, as a signal for the menu. */
  private readonly drawnClose = signal<number | null>(null);
  /** Width of the price scale, so labels sit just left of it. */
  protected readonly scaleWidth = signal(0);
  /** Height of the chart, so menus near its bottom open upwards instead of being cut off. */
  protected readonly stageHeight = signal(0);

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private markers?: ISeriesMarkersPluginApi<Time>;
  private priceLines: { line: Line; api: IPriceLine }[] = [];
  private dragging?: {
    line: Line;
    api: IPriceLine;
    price: number;
    /** Set when a new TP/SL is being pulled out of the entry at `origin`. */
    bracket?: Bracket;
    origin: number;
    /** The TP/SL tab it was pulled from: a click without moving adds that level. */
    tab?: ExitField;
  };
  private gesture?: Gesture;
  private drawn: Candle[] = [];
  private indicatorSeries = new Map<string, ISeriesApi<'Line'>>();
  private nextDrawingId = PREVIEW_ID + 1;
  private colors = { up: '', down: '', text: '', muted: '' };
  /** Prices of the focused trade, kept inside the price scale. */
  private focusLevels: number[] = [];
  /** The trade the chart last scrolled to, so it scrolls once per pick, not on every bar. */
  private shown: string | null = null;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    afterNextRender(() => {
      this.chart = createChart(this.canvas().nativeElement, {
        autoSize: true,
        timeScale: { timeVisible: true, rightOffset: 8 },
      });
      this.series = this.chart.addSeries(CandlestickSeries, {
        autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => this.autoscale(base()),
      });
      this.applyColors();
      this.markers = createSeriesMarkers(this.series, []);
      this.draw(untracked(this.candles));
      this.applyDates(untracked(this.hideDates));
      this.drawTrades(untracked(this.trades), untracked(this.draft));
      this.drawIndicators(untracked(this.candles), untracked(this.active));
      this.showTrade(untracked(this.focusTrade));
      this.listen();
      // Labels follow their lines when the chart scrolls, zooms or resizes.
      const relayout = () => this.layoutLabels();
      this.chart.timeScale().subscribeVisibleLogicalRangeChange(relayout);
      this.chart.timeScale().subscribeSizeChange(relayout);
      this.chart.subscribeCrosshairMove(relayout);
    });

    effect(() => this.draw(this.candles()));
    effect(() => {
      // Light or dark mode: the canvas takes the page's colors again, and the lines and labels
      // drawn with them are redrawn.
      this.theme.theme();
      untracked(() => {
        if (this.chart) {
          this.applyColors();
          this.drawTrades(this.trades(), this.draft(), this.drawings());
        }
      });
    });
    effect(() => this.applyDates(this.hideDates()));
    effect(() => {
      // A start given after the bars frames the replay too.
      this.startTime();
      untracked(() => this.showReplay());
    });
    effect(() => {
      // Labels and markers are drawn in the current language.
      this.i18n.messages();
      this.drawTrades(this.trades(), this.draft(), this.drawings());
    });
    effect(() => this.drawIndicators(this.candles(), this.active()));
    effect(() => {
      const id = this.focusTrade();
      this.positionBoxes();
      this.startTime();
      this.trades();
      this.candles();
      untracked(() => {
        this.showTrade(id);
        this.layoutLabels();
      });
    });
    effect(() => {
      this.drawings();
      this.anchors();
      this.cursor();
      // Measurements are labelled in the current language.
      this.i18n.messages();
      this.editing();
      this.barSeconds();
      untracked(() => this.series && this.shapes.set(this.placeShapes()));
    });
    effect(() => {
      // While a tool is on, the chart stays still so presses place points.
      const still = !!this.tool();
      untracked(() => this.chart?.applyOptions({ handleScroll: !still, handleScale: !still }));
    });
    inject(DestroyRef).onDestroy(() => this.chart?.remove());
  }

  protected toggleIndicator(id: string): void {
    this.active.update((active) => {
      const next = new Set(active);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  /** Opens the indicators or drawings menu below its button, or closes it. */
  protected toggleToolMenu(kind: 'indicators' | 'drawings', event: MouseEvent): void {
    if (this.toolMenu()?.kind === kind) {
      this.toolMenu.set(null);
      return;
    }
    const host = this.host.getBoundingClientRect();
    const button = (event.currentTarget as HTMLElement).getBoundingClientRect();
    // Menus are up to about 250 px wide: near the right edge they open leftwards.
    const left = button.left - host.left;
    const fits = left + 250 <= host.width;
    this.toolMenu.set({
      kind,
      left: fits ? left : null,
      right: fits ? null : Math.max(4, host.right - button.right),
      top: button.bottom - host.top + 4,
    });
  }

  /** Picks a drawing tool from the menu; picking the one that is on puts it down. */
  protected pick(tool: Tool | null): void {
    this.toolMenu.set(null);
    this.tool.update((current) => (current === tool ? null : tool));
    this.anchors.set([]);
    this.cursor.set(null);
    this.selected.set(null);
  }

  protected clearDrawings(): void {
    this.toolMenu.set(null);
    this.drawings.set([]);
    this.pick(null);
  }

  /** The bar of the selected drawing: its color. */
  protected recolor(color: string): void {
    const id = this.selected();
    this.drawings.update((list) =>
      list.map((d) => (d.id === id && d.kind !== 'hline' ? { ...d, color } : d)),
    );
  }

  protected eraseSelected(): void {
    const id = this.selected();
    this.selected.set(null);
    this.drawings.update((list) => list.filter((d) => d.id !== id));
  }

  /** Escape puts down the tool and closes menus; Delete erases the selected drawing. */
  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.menu.set(null);
      this.popup.set(null);
      this.toolMenu.set(null);
      this.pick(null);
    } else if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.selected() !== null &&
      !(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
    ) {
      this.eraseSelected();
    }
  }

  /** SVG polygon points through `pixels`. */
  protected polygon(...pixels: Pixel[]): string {
    return pixels.map((p) => `${p.x},${p.y}`).join(' ');
  }

  /** A handle of the selected drawing: dragging it reshapes the drawing. */
  protected grabHandle(shape: PlacedShape, handle: Handle, event: PointerEvent): void {
    this.startEdit(shape, handle, event);
  }

  /** The × of a label. */
  protected act(action: LabelAction): void {
    if (action.kind === 'close') {
      this.tradeClosed.emit(action.tradeId);
    } else if (action.kind === 'remove') {
      this.levelRemoved.emit(action.level);
    } else if (action.kind === 'discard') {
      this.popup.set(null);
      this.draftDiscarded.emit();
    } else {
      this.drawings.update((list) => list.filter((d) => d.id !== action.drawingId));
    }
  }

  /** Opens the "+" menu at the price under the pointer. */
  protected openMenu(): void {
    const y = this.hoverY();
    const price = y === null ? null : this.series?.coordinateToPrice(y);
    if (y !== null && price !== null && price !== undefined && price > 0) {
      this.menu.set({ y, price: roundPrice(price) });
    }
  }

  protected closeMenu(event: Event): void {
    const target = event.target;
    const inside = (selector: string) => target instanceof Element && !!target.closest(selector);
    if (!inside('.plus, .plus-menu')) {
      this.menu.set(null);
    }
    if (!inside('.popup, .opener')) {
      this.popup.set(null);
    }
    if (!inside('.tool-menu, .menu-trigger')) {
      this.toolMenu.set(null);
    }
  }

  /** A buy or sell from the "+" menu: its line appears, ready to adjust and place. */
  protected orderFromMenu(side: TradeSide, orderType: OrderAt['orderType']): void {
    const menu = this.menu();
    this.menu.set(null);
    if (menu) {
      this.orderAt.emit({ side, orderType, price: menu.price });
    }
  }

  /** "Add order": the order panel's side, as a limit or stop at the menu's price. */
  protected addOrderAt(): void {
    const side = this.draft()?.side ?? 'long';
    const order = this.menuOrders().find((o) => o.side === side);
    if (order) {
      this.orderFromMenu(order.side, order.orderType);
    }
  }

  /** Where a menu opened at `y` goes: below it, or above it in the lower half of the chart. */
  protected below(y: number): { top: number | null; bottom: number | null } {
    const height = this.stageHeight();
    return height && y > height / 2
      ? { top: null, bottom: height - y + 14 }
      : { top: y + 14, bottom: null };
  }

  protected togglePopup(popup: 'lots' | 'type'): void {
    this.popup.update((open) => (open === popup ? null : popup));
  }

  /** Lots on the quantity pad: typed, stepped with −/+ or picked from a shortcut. */
  protected pickLots(lots: number): void {
    this.lotsChanged.emit(formatLots(Math.max(LOT_STEP, lots)));
  }

  protected pickType(type: OrderType): void {
    this.popup.set(null);
    this.draftTypeChanged.emit(type);
  }

  /** A TP/SL tab: dragging it pulls the level out of the entry; a click adds it. */
  protected grabTab(tabs: NonNullable<LineLabel['tabs']>, field: ExitField, event: PointerEvent) {
    const entry = this.priceLines.find((p) => p.line.label?.tabs === tabs);
    if (entry) {
      this.pull(entry.line.price, tabs.bracket, field, event);
    }
  }

  protected drawLineAt(): void {
    const menu = this.menu();
    this.menu.set(null);
    if (menu) {
      const id = this.nextDrawingId++;
      this.drawings.update((list) => [...list, { id, kind: 'hline', price: menu.price }]);
    }
  }

  /** Dragging a line by its label. */
  protected grab(label: PlacedLabel, event: PointerEvent): void {
    const entry = this.priceLines.find((p) => p.line === label.line);
    if (entry && (entry.line.drag || entry.line.bracket)) {
      this.startDrag(entry, event);
    }
  }

  /**
   * When the replay moves forward only the last bar changes (a new minute of the forming bar)
   * or it completes and a new one starts: update those. Anything else redraws everything.
   */
  private draw(candles: Candle[]): void {
    if (!this.series) {
      return;
    }
    const previous = this.drawn;
    const unchanged =
      candles.length === previous.length
        ? candles.length - 1
        : candles.length === previous.length + 1
          ? previous.length - 1
          : -1;
    const isStep =
      previous.length > 0 &&
      unchanged >= 0 &&
      (unchanged === 0 ||
        (candles[0] === previous[0] && candles[unchanged - 1] === previous[unchanged - 1]));
    if (isStep) {
      for (let i = unchanged; i < candles.length; i++) {
        if (candles[i] !== previous[i]) {
          this.series.update(this.point(candles[i]));
        }
      }
    } else {
      this.series.setData(candles.map((c) => this.point(c)));
      // A new set of bars (another timeframe) gets the price range fitted again, even if the
      // student had dragged the price scale, and shows the latest bar; a finished replay is
      // shown whole instead, from its first bar.
      this.chart?.priceScale('right').applyOptions({ autoScale: true });
      this.drawn = candles;
      if (!this.showReplay()) {
        this.chart?.timeScale().scrollToRealTime();
      }
      // Other bars: the focused trade is scrolled to again.
      this.shown = null;
    }
    this.drawn = candles;
    this.layoutLabels();
  }

  private get lastClose(): number | undefined {
    return this.drawn.at(-1)?.close;
  }

  private applyDates(hide: boolean): void {
    this.chart?.applyOptions({
      localization: { timeFormatter: hide ? () => '' : undefined },
      timeScale: { tickMarkFormatter: hide ? () => '' : undefined },
    });
  }

  private drawTrades(
    trades: PracticeTrade[],
    draft: OrderDraft | null,
    drawings: Drawing[] = untracked(this.drawings),
  ): void {
    // Mid-drag the lines stay put; the drop redraws them.
    if (!this.series || !this.markers || this.dragging) {
      return;
    }
    const { up, down, muted } = this.colors;
    const tr = untracked(this.i18n.messages).trading;
    const bar = this.snap(this.barSeconds());
    const markers: SeriesMarker<Time>[] = [];
    for (const t of trades) {
      if (t.status !== 'open' && t.status !== 'closed') {
        continue;
      }
      const long = t.side === 'long';
      markers.push({
        time: bar(t.entryTime) as Time,
        position: long ? 'belowBar' : 'aboveBar',
        shape: long ? 'arrowUp' : 'arrowDown',
        color: long ? up : down,
        text: long ? tr.long : tr.short,
      });
      if (t.status === 'closed' && t.exitTime !== undefined) {
        markers.push({
          time: bar(t.exitTime) as Time,
          position: long ? 'aboveBar' : 'belowBar',
          shape: 'circle',
          color: muted,
          text: signedMoney(t.pnl ?? 0),
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    this.markers.setMarkers(markers);

    this.priceLines.forEach(({ api }) => this.series!.removePriceLine(api));
    this.priceLines = this.lines(trades, draft, drawings).map((line) => ({
      line,
      api: this.series!.createPriceLine({
        price: line.price,
        color: line.color,
        title: '',
        lineWidth: line.drag ? 2 : 1,
        lineStyle: line.style,
      }),
    }));
    this.layoutLabels();
  }

  private lines(trades: PracticeTrade[], draft: OrderDraft | null, drawings: Drawing[]): Line[] {
    const { text, muted } = this.colors;
    const { chart, trading: tr } = untracked(this.i18n.messages);
    const lines: Line[] = [];
    for (const t of trades) {
      const lots = formatLots(tradeLots(t));
      const badge = { text: t.side === 'long' ? tr.long : tr.short, side: t.side, submit: false };
      if (t.status === 'open') {
        const bracket = { target: t.id, side: t.side, quantity: t.quantity };
        lines.push({
          key: t.id,
          price: t.entryPrice,
          color: text,
          style: LineStyle.Solid,
          position: t,
          bracket,
          label: {
            badge,
            text: lots,
            pnl: null,
            tabs: this.tabs(bracket, t),
            action: { kind: 'close', tradeId: t.id, label: chart.closePosition },
          },
        });
        lines.push(...this.stops(t.id, t, () => t.entryPrice, t.quantity, LineStyle.Dashed));
      } else if (t.status === 'pending') {
        lines.push({
          key: t.id,
          price: t.orderPrice!,
          color: text,
          style: LineStyle.Dashed,
          drag: { target: t.id, field: 'price' },
          label: {
            badge,
            text: `${lots} ${tr.orderTypes[t.orderType]}`,
            pnl: null,
            tabs: this.tabs({ target: t.id, side: t.side, quantity: t.quantity }, t),
            action: { kind: 'close', tradeId: t.id, label: chart.cancelOrder },
          },
        });
        lines.push(...this.stops(t.id, t, () => t.orderPrice, t.quantity, LineStyle.Dashed));
      }
    }
    if (draft) {
      const bracket = { target: 'draft', side: draft.side, quantity: draft.quantity };
      const label: LineLabel = {
        badge: {
          text: draft.side === 'long' ? tr.buy : tr.sell,
          side: draft.side,
          submit: true,
        },
        lots: (draft.quantity ?? 0) / LOT_SIZE,
        typeMenu: true,
        warning: draft.error ?? undefined,
        tabs: this.tabs(bracket, draft),
        text: tr.orderTypes[draft.orderType],
        pnl: null,
        action: { kind: 'discard', label: chart.discardOrder },
      };
      const market = draft.orderType === 'market';
      const close = this.lastClose;
      if (market && close !== undefined) {
        lines.push({
          key: 'draft:market',
          price: close,
          color: muted,
          style: LineStyle.Dotted,
          atClose: true,
          bracket,
          label,
        });
      } else if (!market && draft.price !== null) {
        lines.push({
          key: 'draft:price',
          price: draft.price,
          color: muted,
          style: LineStyle.Dotted,
          drag: { target: 'draft', field: 'price' },
          label,
        });
      }
      const entry = () => (market ? (this.lastClose ?? null) : draft.price);
      lines.push(...this.stops('draft', draft, entry, draft.quantity, LineStyle.Dotted));
    }
    for (const d of drawings) {
      if (d.kind === 'hline') {
        lines.push({
          key: `drawing:${d.id}`,
          price: d.price,
          color: DRAWING_COLOR,
          style: LineStyle.Solid,
          drag: { target: `drawing:${d.id}`, field: 'price' },
          label: {
            text: '',
            pnl: null,
            action: { kind: 'erase', drawingId: d.id, label: chart.eraseLine },
          },
        });
      }
    }
    return lines;
  }

  /** The TP/SL tabs of a line, for the levels it does not have yet. */
  private tabs(
    bracket: Bracket,
    levels: Pick<OrderDraft, 'stopLoss' | 'takeProfit'>,
  ): LineLabel['tabs'] {
    const fields = (['takeProfit', 'stopLoss'] as const).filter((f) => levels[f] === null);
    return fields.length ? { bracket, fields } : undefined;
  }

  /** SL and TP lines, labelled with their size and the P/L at that price. */
  private stops(
    target: string,
    t: Pick<OrderDraft, 'side' | 'stopLoss' | 'takeProfit'>,
    entry: () => number | null,
    quantity: number | undefined,
    style: LineStyle,
  ): Line[] {
    const result: Line[] = [];
    for (const field of ['stopLoss', 'takeProfit'] as const) {
      const price = t[field];
      if (price !== null) {
        result.push(this.levelLine(target, t.side, field, price, entry, quantity, style));
      }
    }
    return result;
  }

  private levelLine(
    target: string,
    side: TradeSide,
    field: 'stopLoss' | 'takeProfit',
    price: number,
    entry: () => number | null,
    quantity: number | undefined,
    style: LineStyle,
  ): Line {
    const stop = field === 'stopLoss';
    const { chart, trading } = untracked(this.i18n.messages);
    const pnlAt = (at: number) => {
      const from = entry();
      return from === null || !quantity ? 0 : (side === 'long' ? at - from : from - at) * quantity;
    };
    const known = entry() !== null && !!quantity;
    return {
      key: `${target}:${field}`,
      price,
      color: stop ? this.colors.down : this.colors.up,
      style,
      drag: { target, field },
      entry,
      pnlAt: known ? pnlAt : undefined,
      label: {
        text: `${stop ? 'SL' : 'TP'}${quantity ? ` ${formatLots(quantity / LOT_SIZE)}` : ''}`,
        pnl: known ? pnlAt(price) : null,
        action: {
          kind: 'remove',
          level: { target, field },
          label: chart.removeLevel(trading[field]),
        },
      },
    };
  }

  /** Puts each label on its line, and refreshes the P/L of open positions. */
  private layoutLabels(): void {
    if (!this.series || !this.chart) {
      return;
    }
    const close = this.lastClose;
    this.drawnClose.set(close ?? null);
    const placed: PlacedLabel[] = [];
    const zones: Zone[] = [];
    for (const { line, api } of this.priceLines) {
      // The market order being set up follows the price.
      if (line.atClose && close !== undefined && line.price !== close) {
        line.price = close;
        api.applyOptions({ price: close });
      }
      if (!line.label) {
        continue;
      }
      const price = this.dragging?.line === line ? this.dragging.price : line.price;
      const y = this.series.priceToCoordinate(price);
      if (y === null) {
        continue;
      }
      const from = line.drag?.target === 'draft' ? line.entry?.() : null;
      const fromY = from ? this.series.priceToCoordinate(from) : null;
      if (fromY !== null) {
        zones.push({
          key: line.key,
          top: Math.min(y, fromY),
          height: Math.abs(y - fromY),
          profit: line.drag!.field === 'takeProfit',
        });
      }
      let { pnl } = line.label;
      if (line.position && close !== undefined) {
        const t = line.position;
        pnl = (t.side === 'long' ? close - t.entryPrice : t.entryPrice - close) * t.quantity;
      } else if (line.pnlAt) {
        pnl = line.pnlAt(price);
      }
      placed.push({ ...line.label, pnl, key: line.key, color: line.color, y, line });
    }
    this.labels.set(placed);
    this.zones.set(zones);
    this.boxes.set(this.placeBoxes());
    this.startX.set(this.placeStart());
    this.paneSize.set(this.pane()!);
    this.scaleWidth.set(this.chart.priceScale('right').width());
    this.stageHeight.set(this.stage().nativeElement.clientHeight);
    this.shapes.set(this.placeShapes());
  }

  /** The position boxes of the filled trades, in pixels. */
  private placeBoxes(): PlacedBox[] {
    const series = this.series!;
    const last = this.drawn.at(-1);
    if (!untracked(this.positionBoxes) || !last) {
      return [];
    }
    const focus = untracked(this.focusTrade);
    // A trade opened and closed in the same bar still gets a bar's width.
    const spacing = this.chart!.timeScale().options().barSpacing;
    const band = (from: number, to: number | null) => {
      const a = series.priceToCoordinate(from);
      const b = to === null ? null : series.priceToCoordinate(to);
      return a === null || b === null ? null : { top: Math.min(a, b), height: Math.abs(a - b) };
    };
    const boxes: PlacedBox[] = [];
    const live = untracked(this.trading);
    for (const trade of filledTrades(untracked(this.trades))) {
      if (live && trade.status !== 'closed') {
        continue;
      }
      const box = tradeBox(trade, last.time);
      const left = this.timeToX(box.start);
      const end = this.timeToX(box.end);
      const entryY = series.priceToCoordinate(box.entry);
      if (left === null || end === null || entryY === null) {
        continue;
      }
      const right = Math.max(end, left + spacing);
      const exitY = box.exit === null ? null : series.priceToCoordinate(box.exit);
      boxes.push({
        id: box.id,
        left,
        right,
        entryY,
        profit: band(box.entry, box.profit),
        loss: band(box.entry, box.loss),
        exit: exitY === null ? null : { x: right, y: exitY },
        focused: box.id === focus,
        pnl: box.pnl,
      });
    }
    return boxes;
  }

  /** The replay start line's x, half a bar before the first replayed bar. */
  private placeStart(): number | null {
    const first = this.firstReplayed();
    if (first === null || !this.chart) {
      return null;
    }
    const x = this.chart.timeScale().logicalToCoordinate(first as Logical);
    return x === null ? null : x - this.chart.timeScale().options().barSpacing / 2;
  }

  /**
   * Index of the first bar the replay showed: the first at or after `startTime` (the market may
   * have been closed at the start itself). Null without a start, or with no history before it.
   */
  private firstReplayed(): number | null {
    const start = untracked(this.startTime);
    const last = this.drawn.at(-1);
    if (start === null || !last || start > last.time || start <= this.drawn[0].time) {
      return null;
    }
    const index = this.indexAt(start);
    return this.drawn[index].time < start ? index + 1 : index;
  }

  /**
   * Fits a finished replay in view, from a little before its first bar (with the start line)
   * to its last, and at least `MIN_REPLAY_VIEW` bars wide. False when there is no start.
   */
  private showReplay(): boolean {
    const first = this.firstReplayed();
    if (first === null || !this.chart) {
      return false;
    }
    const last = this.drawn.length - 1;
    const pad = Math.max(3, Math.round((last - first) * 0.05));
    const from = Math.min(first - pad, last - MIN_REPLAY_VIEW);
    this.chart.timeScale().setVisibleLogicalRange({ from, to: last + pad });
    return true;
  }

  /** Scrolls to a trade, from a little before its entry to a little after its exit. */
  private showTrade(id: string | null): void {
    const trade = id ? untracked(this.trades).find((t) => t.id === id) : undefined;
    this.focusLevels = trade
      ? [trade.entryPrice, trade.stopLoss, trade.takeProfit, trade.exitPrice].filter(
          (p): p is number => typeof p === 'number',
        )
      : [];
    if (!this.chart || !trade || !this.drawn.length) {
      this.shown = null;
      return;
    }
    if (this.shown === id) {
      return;
    }
    this.shown = trade.id;
    const from = this.indexAt(trade.entryTime);
    const to =
      trade.status === 'closed' && trade.exitTime !== undefined
        ? this.indexAt(trade.exitTime)
        : this.drawn.length - 1;
    const pad = Math.max(20, to - from);
    this.chart.timeScale().setVisibleLogicalRange({ from: from - pad, to: to + pad / 2 });
    this.chart.priceScale('right').applyOptions({ autoScale: true });
    // The price scale refits on the chart's next frame; the boxes follow it then.
    requestAnimationFrame(() => requestAnimationFrame(() => this.layoutLabels()));
  }

  /** The candles' price range, stretched to the focused trade's entry, exit, SL and TP. */
  private autoscale(info: AutoscaleInfo | null): AutoscaleInfo | null {
    const levels = this.focusLevels;
    if (!info?.priceRange || !levels.length) {
      return info;
    }
    const { minValue, maxValue } = info.priceRange;
    return {
      ...info,
      priceRange: {
        minValue: Math.min(minValue, ...levels),
        maxValue: Math.max(maxValue, ...levels),
      },
    };
  }

  /** The drawings of the overlay in pixels, with the one being placed. */
  private placeShapes(): PlacedShape[] {
    const editing = untracked(this.editing);
    const list = untracked(this.drawings).map((d) => (editing?.id === d.id ? editing : d));
    const preview = this.preview();
    if (preview) {
      list.push(preview);
    }
    const shapes: PlacedShape[] = [];
    for (const d of list) {
      const shape = d.kind === 'hline' ? null : this.placeShape(d);
      if (shape) {
        shapes.push(shape);
      }
    }
    return shapes;
  }

  /** One drawing in pixels: its lines, handles and, for measures, their labels. */
  private placeShape(d: ShapeDrawing): PlacedShape | null {
    const series = this.series!;
    const pixels: Pixel[] = [];
    for (const point of d.points) {
      const pixel = this.toPixel(point);
      if (!pixel) {
        return null;
      }
      pixels.push(pixel);
    }
    const a = pixels[0];
    const b = pixels[1] ?? a;
    const pane = this.pane() ?? { width: 0, height: 0 };
    const tr = untracked(this.i18n.messages).chart;
    const shape: PlacedShape = {
      id: d.id,
      kind: d.kind,
      color: d.color,
      pixels,
      a,
      b,
      left: Math.min(a.x, b.x),
      right: Math.max(a.x, b.x),
      top: Math.min(a.y, b.y),
      bottom: Math.max(a.y, b.y),
      segment: [a, b],
      levels: [],
      handles: [
        { key: 'a', ...a, timeOf: 0, priceOf: 0 },
        { key: 'b', ...b, timeOf: 1, priceOf: 1 },
      ],
    };
    switch (d.kind) {
      case 'ray':
        shape.segment = [a, extend(a, b, pane.width)];
        break;
      case 'extended':
        shape.segment = [extend(b, a, pane.width), extend(a, b, pane.width)];
        break;
      case 'arrow':
        shape.head = arrowHead(a, b);
        break;
      case 'hray':
        shape.segment = [a, { x: Math.max(a.x, pane.width), y: a.y }];
        shape.handles = [{ key: 'a', ...a, timeOf: 0, priceOf: 0 }];
        break;
      case 'vline':
        shape.segment = [
          { x: a.x, y: 0 },
          { x: a.x, y: pane.height },
        ];
        shape.handles = [{ key: 'a', x: a.x, y: pane.height / 2, timeOf: 0, priceOf: null }];
        break;
      case 'channel': {
        // The offset is a price distance; the price scale is linear, so it is one height.
        const dy = (series.priceToCoordinate(d.points[0].price + (d.offset ?? 0)) ?? a.y) - a.y;
        const parallel: [Pixel, Pixel] = [
          { x: a.x, y: a.y + dy },
          { x: b.x, y: b.y + dy },
        ];
        shape.parallel = parallel;
        shape.top = Math.min(shape.top, shape.top + dy);
        shape.bottom = Math.max(shape.bottom, shape.bottom + dy);
        shape.handles.push({
          key: 'offset',
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2 + dy,
          timeOf: null,
          priceOf: null,
          level: 'offset',
        });
        break;
      }
      case 'rect':
        shape.handles = this.rectHandles(a, b, shape);
        break;
      case 'fib':
        // A retracement runs from the end of the move (0) back to its start (1).
        shape.levels = FIB_LEVELS.map(({ ratio, color }) => {
          const [pa, pb] = d.points;
          const price = roundPrice(pb.price + (pa.price - pb.price) * ratio);
          return { ratio, price, y: series.priceToCoordinate(price) ?? 0, color };
        });
        break;
      case 'long':
      case 'short': {
        const entry = d.points[0].price;
        const target = d.points[1].price;
        const stop = d.stop ?? entry;
        const stopY = series.priceToCoordinate(stop) ?? a.y;
        const reward = Math.abs(target - entry);
        const risk = Math.abs(entry - stop);
        const band = (y: number) => ({ top: Math.min(a.y, y), height: Math.abs(a.y - y) });
        // Labels sit outside the box, past the target and the stop.
        const outside = (y: number) => (y < a.y ? y - 5 : y + 13);
        shape.top = Math.min(b.y, stopY);
        shape.bottom = Math.max(b.y, stopY);
        shape.position = {
          entryY: a.y,
          profit: band(b.y),
          loss: band(stopY),
          labels: [
            {
              key: 'target',
              y: outside(b.y),
              up: true,
              text: tr.positionTarget(formatDistance(reward, entry), formatPercent(reward, entry)),
            },
            {
              key: 'stop',
              y: outside(stopY),
              up: false,
              text: tr.positionStop(formatDistance(risk, entry), formatPercent(risk, entry)),
            },
          ],
          ratio: tr.riskReward(risk ? (reward / risk).toFixed(2) : '-'),
        };
        shape.handles = [
          { key: 'entry', ...a, timeOf: 0, priceOf: 0 },
          { key: 'target', x: a.x, y: b.y, timeOf: null, priceOf: 1 },
          { key: 'stop', x: a.x, y: stopY, timeOf: null, priceOf: null, level: 'stop' },
          { key: 'end', x: b.x, y: a.y, timeOf: 1, priceOf: null },
        ];
        break;
      }
      case 'range': {
        const [from, to] = d.points;
        const change = to.price - from.price;
        const bars = this.indexAt(to.time) - this.indexAt(from.time);
        const middle = (shape.left + shape.right) / 2;
        shape.segment = [
          { x: middle, y: a.y },
          { x: middle, y: b.y },
        ];
        shape.head = arrowHead(...shape.segment);
        shape.range = {
          up: change >= 0,
          y: change >= 0 ? shape.top - 6 : shape.bottom + 14,
          text: tr.rangeLabel(
            formatDistance(change, from.price, true),
            formatPercent(change, from.price, true),
            bars,
          ),
        };
        break;
      }
    }
    return shape;
  }

  /** A rectangle's corners and the middle of its sides, each moving what it sits on. */
  private rectHandles(
    a: Pixel,
    b: Pixel,
    box: Pick<PlacedShape, 'left' | 'right' | 'top' | 'bottom'>,
  ): Handle[] {
    const left = a.x <= b.x ? 0 : 1;
    const top = a.y <= b.y ? 0 : 1;
    const right = left === 0 ? 1 : 0;
    const bottom = top === 0 ? 1 : 0;
    const midX = (box.left + box.right) / 2;
    const midY = (box.top + box.bottom) / 2;
    return [
      { key: 'tl', x: box.left, y: box.top, timeOf: left, priceOf: top },
      { key: 't', x: midX, y: box.top, timeOf: null, priceOf: top },
      { key: 'tr', x: box.right, y: box.top, timeOf: right, priceOf: top },
      { key: 'r', x: box.right, y: midY, timeOf: right, priceOf: null },
      { key: 'br', x: box.right, y: box.bottom, timeOf: right, priceOf: bottom },
      { key: 'b', x: midX, y: box.bottom, timeOf: null, priceOf: bottom },
      { key: 'bl', x: box.left, y: box.bottom, timeOf: left, priceOf: bottom },
      { key: 'l', x: box.left, y: midY, timeOf: left, priceOf: null },
    ];
  }

  /** The drawing being placed, from its points so far to the cursor. */
  private preview(): ShapeDrawing | null {
    const tool = untracked(this.tool);
    const anchors = untracked(this.anchors);
    const cursor = untracked(this.cursor);
    const point = cursor && this.toPoint(cursor);
    if (!tool || tool === 'hline' || !point || (POINTS[tool] > 1 && !anchors.length)) {
      return null;
    }
    return this.build(tool, [...anchors, point], PREVIEW_ID);
  }

  /** A drawing of `tool` through `points`; a channel of two points is still a line. */
  private build(tool: ShapeKind, points: ChartPoint[], id: number): ShapeDrawing {
    const color = DRAWING_COLOR;
    if (tool === 'channel') {
      const [a, b = a, c] = points;
      return { id, kind: tool, points: [a, b], color, offset: c ? this.offsetOf(a, b, c) : 0 };
    }
    if (tool === 'long' || tool === 'short') {
      const [entry, end] = points;
      const up = tool === 'long' ? 1 : -1;
      // The second point sets the target, or the stop when it is on the losing side; the
      // other one mirrors it, for a risk/reward of 1 to adjust from.
      const move = (end.price - entry.price) * up;
      const mirror = roundPrice(entry.price - move * up);
      return {
        id,
        kind: tool,
        points: [entry, { time: end.time, price: move >= 0 ? end.price : mirror }],
        color,
        stop: move >= 0 ? mirror : end.price,
      };
    }
    return { id, kind: tool, points: points.slice(0, POINTS[tool]), color };
  }

  /** Price distance from the line through `a` and `b` to `c`, at `c`'s bar. */
  private offsetOf(a: ChartPoint, b: ChartPoint, c: ChartPoint): number {
    const [pa, pb, pc] = [a, b, c].map((p) => this.toPixel(p));
    if (!pa || !pb || !pc || pa.x === pb.x) {
      return roundPrice(c.price - a.price);
    }
    const y = pa.y + ((pb.y - pa.y) * (pc.x - pa.x)) / (pb.x - pa.x);
    const price = this.series!.coordinateToPrice(y);
    return price === null ? 0 : roundPrice(c.price - price);
  }

  private toPixel(point: ChartPoint): Pixel | null {
    const x = this.timeToX(point.time);
    const y = this.series!.priceToCoordinate(point.price);
    return x === null || y === null ? null : { x, y };
  }

  /** The bar and price at a pixel of the candles' pane. */
  private toPoint(pixel: Pixel): ChartPoint | null {
    const time = this.xToTime(pixel.x);
    const price = this.series?.coordinateToPrice(pixel.y);
    return time === null || !price || price <= 0 ? null : { time, price: roundPrice(price) };
  }

  /** Time of the bar at x; past either end of the candles, the first or last one. */
  private xToTime(x: number): number | null {
    const logical = this.chart?.timeScale().coordinateToLogical(x);
    if (logical === null || logical === undefined || !this.drawn.length) {
      return null;
    }
    const index = Math.min(this.drawn.length - 1, Math.max(0, Math.round(logical)));
    return this.drawn[index].time;
  }

  /** X of the bar a time falls in; times outside the candles stick to the first or last. */
  private timeToX(time: number): number | null {
    if (!this.drawn.length || !this.chart) {
      return null;
    }
    return this.chart.timeScale().logicalToCoordinate(this.indexAt(time) as Logical);
  }

  /** Index of the bar a time falls in; times outside the candles stick to the first or last. */
  private indexAt(time: number): number {
    const candles = this.drawn;
    let low = 0;
    let high = candles.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (candles[mid].time <= time) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  /** Reads the color tokens of the current theme (styles.scss) into the chart. */
  private applyColors(): void {
    const css = getComputedStyle(this.host);
    const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    this.colors = {
      up: color('--color-up', '#0f7b4d'),
      down: color('--color-down', '#b3261e'),
      text: color('--color-text', '#111111'),
      muted: color('--color-muted', '#5f5f5f'),
    };
    const up = color('--color-candle-up', '#089981');
    const down = color('--color-candle-down', '#f23645');
    const grid = color('--color-surface', '#f5f5f5');
    this.chart?.applyOptions({
      layout: {
        background: { color: color('--color-bg', '#ffffff') },
        textColor: this.colors.text,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    });
    this.series?.applyOptions({
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    });
  }

  private drawIndicators(candles: Candle[], active: ReadonlySet<string>): void {
    const chart = this.chart;
    if (!chart) {
      return;
    }
    for (const indicator of INDICATORS) {
      let series = this.indicatorSeries.get(indicator.id);
      if (!active.has(indicator.id)) {
        if (series) {
          chart.removeSeries(series);
          this.indicatorSeries.delete(indicator.id);
        }
        continue;
      }
      if (!series) {
        const rsi = indicator.kind === 'rsi';
        series = chart.addSeries(
          LineSeries,
          {
            color: indicator.color,
            lineWidth: rsi ? 1 : 2,
            priceLineVisible: false,
            lastValueVisible: rsi,
            crosshairMarkerVisible: false,
          },
          rsi ? 1 : 0,
        );
        if (rsi) {
          RSI_LEVELS.forEach((price) =>
            series!.createPriceLine({
              price,
              color: this.colors.muted,
              lineStyle: LineStyle.Dashed,
              lineWidth: 1,
              axisLabelVisible: false,
              title: '',
            }),
          );
          chart.panes()[1]?.setHeight(RSI_PANE_HEIGHT);
        }
        this.indicatorSeries.set(indicator.id, series);
      }
      series.setData(
        computeIndicator(indicator, candles).map((p) => ({
          time: p.time as Time,
          // Averages at price precision: float noise on flat prices would stretch the scale.
          value: indicator.kind === 'rsi' ? p.value : roundPrice(p.value),
        })),
      );
    }
  }

  /** Maps a time to the start of its bar. */
  private snap(barSeconds: number): (time: number) => number {
    return (time) => (barSeconds > 0 ? Math.floor(time / barSeconds) * barSeconds : time);
  }

  /** The candles' pane, in pixels of the stage: drawings live there. */
  private pane(): { width: number; height: number } | null {
    const chart = this.chart;
    return chart
      ? { width: chart.timeScale().width(), height: chart.panes()[0].getHeight() }
      : null;
  }

  private inPane(p: Pixel): boolean {
    const pane = this.pane();
    return !!pane && p.x >= 0 && p.x <= pane.width && p.y >= 0 && p.y <= pane.height;
  }

  private clampToPane(p: Pixel): Pixel {
    const pane = this.pane() ?? { width: 0, height: 0 };
    return {
      x: Math.min(pane.width, Math.max(0, p.x)),
      y: Math.min(pane.height, Math.max(0, p.y)),
    };
  }

  /** The drawing under the pointer, the selected one first, then the newest. */
  private shapeAt(p: Pixel, touch: boolean): PlacedShape | undefined {
    const reach = touch ? TOUCH_GRAB_DISTANCE : GRAB_DISTANCE;
    const selected = untracked(this.selected);
    const shapes = untracked(this.shapes)
      .filter((s) => s.id !== PREVIEW_ID)
      .reverse()
      .sort((s, t) => Number(t.id === selected) - Number(s.id === selected));
    return shapes.find((s) => {
      if (s.parallel) {
        return (
          distanceToSegment(p, ...s.segment) <= reach ||
          distanceToSegment(p, ...s.parallel) <= reach ||
          insideChannel(p, s.segment, s.parallel)
        );
      }
      if (['trend', 'ray', 'extended', 'arrow', 'hray', 'vline'].includes(s.kind)) {
        return distanceToSegment(p, ...s.segment) <= reach;
      }
      const ys = s.kind === 'fib' ? s.levels.map((l) => l.y) : [s.top, s.bottom];
      return (
        p.x >= s.left - reach &&
        p.x <= s.right + reach &&
        p.y >= Math.min(...ys) - reach &&
        p.y <= Math.max(...ys) + reach
      );
    });
  }

  /** Starts placing a point of the drawing of the current tool. */
  private startPlacing(p: Pixel, event: PointerEvent): void {
    const tool = untracked(this.tool)!;
    const touch = event.pointerType === 'touch';
    this.holdPointer(event);
    // With a mouse, the press puts the first point (a drag then draws the whole shape); on a
    // phone it waits for the finger to lift, from where the crosshair was.
    const anchored = untracked(this.anchors).length > 0;
    if (!touch && !anchored && POINTS[tool] > 1) {
      const point = this.toPoint(p);
      if (point) {
        this.anchors.set([point]);
      }
    }
    const cursor = untracked(this.cursor);
    const from = touch && cursor ? { x: cursor.x, y: cursor.y } : p;
    this.gesture = {
      pointerId: event.pointerId,
      start: p,
      touch,
      moved: false,
      place: { from, anchored },
    };
    this.cursor.set({ ...from, touch });
  }

  /** Starts dragging the selected drawing, by a handle or whole. */
  private startEdit(shape: PlacedShape, handle: Handle | null, event: PointerEvent): void {
    const drawing = untracked(this.drawings).find((d) => d.id === shape.id);
    if (!drawing || drawing.kind === 'hline') {
      return;
    }
    this.holdPointer(event);
    const box = this.stage().nativeElement.getBoundingClientRect();
    this.gesture = {
      pointerId: event.pointerId,
      start: { x: event.clientX - box.left, y: event.clientY - box.top },
      touch: event.pointerType === 'touch',
      moved: false,
      edit: { drawing, from: shape.pixels, handle },
    };
  }

  /** Follows a press about drawings; true when the chart should not see the move. */
  private moveGesture(gesture: Gesture, p: Pixel): boolean {
    const dx = p.x - gesture.start.x;
    const dy = p.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) >= (gesture.touch ? TOUCH_TAP_SLOP : TAP_SLOP)) {
      gesture.moved = true;
    }
    if (gesture.place) {
      // A finger moves the crosshair by as much as it moves, from where it was.
      const { from } = gesture.place;
      const at = gesture.touch ? { x: from.x + dx, y: from.y + dy } : p;
      this.cursor.set({ ...this.clampToPane(at), touch: gesture.touch });
      return true;
    }
    if (gesture.edit && gesture.moved) {
      this.editing.set(this.reshape(gesture.edit, dx, dy));
    }
    return !!gesture.edit;
  }

  /** Ends a press about drawings. */
  private endGesture(gesture: Gesture, p: Pixel): void {
    if (gesture.place) {
      this.release();
      // A tap puts the point where it lands; a drag where the crosshair ends.
      const cursor = untracked(this.cursor);
      const at = gesture.touch && gesture.moved && cursor ? cursor : this.clampToPane(p);
      this.placePoint(gesture, at);
    } else if (gesture.edit) {
      this.release();
      const edited = untracked(this.editing);
      this.editing.set(null);
      if (edited) {
        this.drawings.update((list) => list.map((d) => (d.id === edited.id ? edited : d)));
      }
    } else if (!gesture.moved) {
      this.selected.set(gesture.select ?? null);
    }
  }

  /** Puts a point of the drawing of the current tool at `at`. */
  private placePoint(gesture: Gesture, at: Pixel): void {
    const tool = untracked(this.tool);
    const point = this.toPoint(at);
    if (!tool || !point) {
      return;
    }
    if (tool === 'hline') {
      const id = this.nextDrawingId++;
      this.drawings.update((list) => [...list, { id, kind: 'hline', price: point.price }]);
      this.pick(null);
      return;
    }
    const anchors = untracked(this.anchors);
    const needed = POINTS[tool];
    if (needed > 1 && !anchors.length) {
      // A finger lifted on the first point: the crosshair stays there for the next one.
      this.anchors.set([point]);
      this.cursor.set({ ...at, touch: gesture.touch });
      return;
    }
    if (needed > 1 && !gesture.touch && !gesture.place!.anchored && !gesture.moved) {
      // The click that put the first point: the next one comes with the next click.
      return;
    }
    const last = anchors.length === 1 ? anchors[0] : null;
    if (last && last.time === point.time && (LINE_KINDS.has(tool) || last.price === point.price)) {
      return;
    }
    const points = [...anchors, point];
    if (points.length < needed) {
      this.anchors.set(points);
      this.cursor.set({ ...at, touch: gesture.touch });
      return;
    }
    // Lines, channels and rectangles go left to right; rays, arrows, retracements, positions
    // and measures keep the direction they were drawn in.
    if (tool === 'trend' || tool === 'extended' || tool === 'channel' || tool === 'rect') {
      points.splice(0, 2, ...points.slice(0, 2).sort((p, q) => p.time - q.time));
    }
    const id = this.nextDrawingId++;
    this.drawings.update((list) => [...list, this.build(tool, points, id)]);
    this.pick(null);
    this.selected.set(id);
  }

  /** The drawing being edited, moved by (dx, dy) pixels: one handle's coordinates, or all. */
  private reshape(edit: NonNullable<Gesture['edit']>, dx: number, dy: number): ShapeDrawing {
    const { drawing, from, handle } = edit;
    if (handle?.level) {
      // A channel's width or a position's stop: by the price the handle moved.
      const was = this.series!.coordinateToPrice(handle.y);
      const now = this.series!.coordinateToPrice(handle.y + dy);
      if (was === null || now === null) {
        return drawing;
      }
      const value = roundPrice((drawing[handle.level] ?? 0) + now - was);
      return handle.level === 'stop' ? { ...drawing, stop: value } : { ...drawing, offset: value };
    }
    const points = drawing.points.map((point, i) => {
      const moveX = !handle || handle.timeOf === i;
      const moveY = !handle || handle.priceOf === i;
      const next = this.toPoint({
        x: from[i].x + (moveX ? dx : 0),
        y: from[i].y + (moveY ? dy : 0),
      });
      return {
        time: moveX && next ? next.time : point.time,
        price: moveY && next ? next.price : point.price,
      };
    });
    const moved = { ...drawing, points };
    if (!handle && drawing.stop !== undefined) {
      // A position moved whole takes its stop along.
      moved.stop = roundPrice(drawing.stop + points[0].price - drawing.points[0].price);
    }
    return moved;
  }

  private startDrag(entry: { line: Line; api: IPriceLine }, event: PointerEvent): void {
    const bracket = entry.line.drag ? undefined : entry.line.bracket;
    if (bracket) {
      // Dragging away from an entry pulls out a new take profit or stop loss.
      this.pull(entry.line.price, bracket, undefined, event);
      return;
    }
    this.holdPointer(event);
    this.dragging = { ...entry, price: entry.line.price, origin: entry.line.price };
  }

  /** Starts pulling a new TP/SL out of the entry at `price`, from the line or one of its tabs. */
  private pull(price: number, bracket: Bracket, tab: ExitField | undefined, event: PointerEvent) {
    this.holdPointer(event);
    const line = this.levelLine(
      bracket.target,
      bracket.side,
      tab ?? 'takeProfit',
      price,
      () => price,
      bracket.quantity,
      LineStyle.Dashed,
    );
    const api = this.series!.createPriceLine({
      price,
      color: line.color,
      title: '',
      lineWidth: 2,
      lineStyle: line.style,
    });
    this.priceLines.push({ line, api });
    this.dragging = { line, api, price, bracket, origin: price, tab };
  }

  /** Keeps the pointer for the drag: the chart neither pans nor zooms meanwhile. */
  private holdPointer(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.chart!.applyOptions({ handleScroll: false, handleScale: false });
    this.stage().nativeElement.setPointerCapture?.(event.pointerId);
  }

  /** Gives the chart its panning and zooming back, unless a drawing tool is on. */
  private release(): void {
    const still = !!untracked(this.tool);
    this.chart!.applyOptions({ handleScroll: !still, handleScale: !still });
  }

  /**
   * Lets the pointer grab draggable lines, place drawings and select them; the chart pans and
   * zooms as usual elsewhere.
   */
  private listen(): void {
    const stage = this.stage().nativeElement;
    const y = (event: PointerEvent) => event.clientY - stage.getBoundingClientRect().top;
    /** The draggable line closest to the pointer, if one is within reach. */
    const near = (event: PointerEvent) => {
      let best: (typeof this.priceLines)[number] | undefined;
      let bestDistance = event.pointerType === 'touch' ? TOUCH_GRAB_DISTANCE : GRAB_DISTANCE;
      for (const entry of this.priceLines) {
        const grabbable = entry.line.drag || entry.line.bracket;
        const at = grabbable ? this.series!.priceToCoordinate(entry.line.price) : null;
        const distance = at === null ? Infinity : Math.abs(at - y(event));
        if (distance <= bestDistance) {
          best = entry;
          bestDistance = distance;
        }
      }
      return best;
    };

    const at = (event: PointerEvent): Pixel => {
      const box = stage.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    // Capture phase, so a grab never reaches the chart's own pan handling.
    this.canvas().nativeElement.addEventListener(
      'pointerdown',
      (event) => {
        const p = at(event);
        if (untracked(this.tool)) {
          // Only the candles' pane takes drawings, not the scales or the RSI pane.
          if (this.inPane(p)) {
            this.startPlacing(p, event);
          }
          return;
        }
        const touch = event.pointerType === 'touch';
        const shape = this.inPane(p) ? this.shapeAt(p, touch) : undefined;
        if (shape && shape.id === untracked(this.selected)) {
          this.startEdit(shape, null, event);
          return;
        }
        // A tap selects the drawing under it, or puts the selection down; a drag pans.
        this.gesture = {
          pointerId: event.pointerId,
          start: p,
          touch,
          moved: false,
          select: shape?.id ?? null,
        };
        const hit = shape ? undefined : near(event);
        if (hit) {
          this.gesture = undefined;
          this.startDrag(hit, event);
        } else if (touch && !shape) {
          // A phone has no hover: a tap on the candles puts the "+" at that price.
          this.hoverY.set(this.overCandles(event) ? y(event) : null);
        }
      },
      { capture: true },
    );
    stage.addEventListener(
      'pointermove',
      (event) => {
        const gesture = this.gesture;
        if (gesture && this.moveGesture(gesture, at(event))) {
          event.stopPropagation();
          return;
        }
        if (!this.dragging) {
          const tool = untracked(this.tool);
          if (tool && event.pointerType !== 'touch') {
            // A mouse leads the drawing being placed.
            this.cursor.set({ ...this.clampToPane(at(event)), touch: false });
          }
          const shape = tool ? undefined : this.shapeAt(at(event), false);
          stage.style.cursor = tool
            ? 'crosshair'
            : shape?.id === untracked(this.selected) && shape
              ? 'move'
              : shape
                ? 'pointer'
                : near(event)
                  ? 'ns-resize'
                  : '';
          const onPlus = event.target instanceof Element && event.target.closest('.plus');
          if (!onPlus) {
            this.hoverY.set(this.overCandles(event) ? y(event) : null);
          }
          return;
        }
        event.stopPropagation();
        const price = this.series!.coordinateToPrice(y(event));
        if (price !== null && price > 0) {
          this.dragging.price = roundPrice(price);
          this.dragging.api.applyOptions({ price: this.dragging.price });
          if (this.dragging.bracket) {
            const { line, bracket, origin } = this.dragging;
            this.pullLevel(line, bracket, origin, this.dragging.price);
            this.dragging.api.applyOptions({ color: this.dragging.line.color });
          }
          this.layoutLabels();
        }
      },
      { capture: true },
    );
    const drop = (event: PointerEvent) => {
      const gesture = this.gesture;
      if (gesture) {
        this.gesture = undefined;
        if (gesture.place || gesture.edit) {
          event.stopPropagation();
        }
        if (event.type === 'pointercancel') {
          this.editing.set(null);
          this.release();
        } else {
          this.endGesture(gesture, at(event));
        }
        return;
      }
      const dragging = this.dragging;
      if (!dragging) {
        return;
      }
      event.stopPropagation();
      this.dragging = undefined;
      this.release();
      const { target, field } = dragging.line.drag!;
      if (dragging.bracket && dragging.price === dragging.origin) {
        this.drawTrades(this.trades(), this.draft());
        if (dragging.tab) {
          this.levelAdded.emit({ target: dragging.bracket.target, field: dragging.tab });
        }
        return;
      }
      if (target.startsWith('drawing:')) {
        const id = Number(target.slice('drawing:'.length));
        this.drawings.update((list) =>
          list.map((d) =>
            d.id === id && d.kind === 'hline' ? { ...d, price: dragging.price } : d,
          ),
        );
        return;
      }
      if (field !== 'price' && !dragging.bracket && this.onEntry(dragging.line, dragging.price)) {
        // A TP/SL dropped back on its entry is taken off, as in TradingView.
        this.levelRemoved.emit({ target, field });
      } else {
        this.levelMoved.emit({ target, field, price: dragging.price });
      }
      // If the page rejects the move its inputs stay the same, so put the line back.
      setTimeout(() => this.drawTrades(this.trades(), this.draft()));
    };
    // On a touch screen a drag would also scroll the page and pan the chart: the pointerdown
    // that grabbed a line comes first, so its touches are kept from both.
    const holdTouch = (event: TouchEvent) => {
      if (this.dragging || this.gesture?.place || this.gesture?.edit || untracked(this.tool)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    stage.addEventListener('touchstart', holdTouch, { capture: true, passive: false });
    stage.addEventListener('touchmove', holdTouch, { capture: true, passive: false });
    // A finger leaves the stage on every lift, so a tapped "+" stays until the next tap.
    stage.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') {
        this.hoverY.set(null);
      }
    });
    stage.addEventListener('pointerup', drop, { capture: true });
    stage.addEventListener('pointercancel', drop, { capture: true });
  }

  /** Whether a TP/SL at `price` sits on its line's entry, within grabbing distance. */
  private onEntry(line: Line, price: number): boolean {
    const entry = line.entry?.();
    const at = this.series!.priceToCoordinate(price);
    const from = entry ? this.series!.priceToCoordinate(entry) : null;
    return at !== null && from !== null && Math.abs(at - from) <= GRAB_DISTANCE;
  }

  /** Whether the pointer is over the candles of a live practice, where "+" is offered. */
  private overCandles(event: PointerEvent): boolean {
    const chart = this.chart;
    if (!chart || !untracked(this.trading) || untracked(this.tool)) {
      return false;
    }
    const box = this.canvas().nativeElement.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    return x >= 0 && x <= chart.timeScale().width() && y >= 0 && y <= chart.panes()[0].getHeight();
  }

  /** Turns the line pulled out of an entry into a take profit or a stop loss, by its side. */
  private pullLevel(line: Line, bracket: Bracket, origin: number, price: number): void {
    const profit = price > origin === (bracket.side === 'long');
    Object.assign(
      line,
      this.levelLine(
        bracket.target,
        bracket.side,
        profit ? 'takeProfit' : 'stopLoss',
        price,
        () => origin,
        bracket.quantity,
        LineStyle.Dashed,
      ),
    );
  }

  private point(candle: Candle) {
    return { ...candle, time: candle.time as Time };
  }
}

/** Where the line from `a` through `b` leaves the pane, past `b` (x = 0 or `width`). */
function extend(a: Pixel, b: Pixel, width: number): Pixel {
  const dx = b.x - a.x;
  if (!dx) {
    return b;
  }
  const x = dx > 0 ? Math.max(width, b.x) : Math.min(0, b.x);
  return { x, y: a.y + ((b.y - a.y) * (x - a.x)) / dx };
}

/** The head of an arrow from `a` to `b`, as SVG polygon points. */
function arrowHead(a: Pixel, b: Pixel): string {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const wing = (turn: number) =>
    `${b.x - ARROW_HEAD * Math.cos(angle + turn)},${b.y - ARROW_HEAD * Math.sin(angle + turn)}`;
  return `${b.x},${b.y} ${wing(0.45)} ${wing(-0.45)}`;
}

/** Whether `p` is between a channel's two lines. */
function insideChannel(p: Pixel, line: [Pixel, Pixel], parallel: [Pixel, Pixel]): boolean {
  const [a, b] = line;
  if (p.x < Math.min(a.x, b.x) || p.x > Math.max(a.x, b.x) || a.x === b.x) {
    return false;
  }
  const y = a.y + ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x);
  const offset = parallel[0].y - a.y;
  return p.y >= Math.min(y, y + offset) && p.y <= Math.max(y, y + offset);
}

/** Distance from `p` to the segment from `a` to `b`, in pixels. */
function distanceToSegment(p: Pixel, a: Pixel, b: Pixel): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
