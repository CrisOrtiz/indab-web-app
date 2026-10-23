import { DecimalPipe } from '@angular/common';
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
import { Candle, OrderType, PracticeTrade, TradeSide } from '../../core/models/practice';
import { INDICATORS, RSI_LEVELS, computeIndicator } from './indicators';
import { ORDER_TYPES, formatLots, priceDigits, roundPrice, signedMoney } from './practice-format';
import { LOT_SIZE, tradeLots } from './replay';

/** The order being set up in the ticket, drawn as draggable lines before it is placed. */
export interface OrderDraft {
  side: TradeSide;
  orderType: OrderType;
  price: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Units the order would buy or sell, to label the SL/TP lines with their P/L. */
  quantity?: number;
}

export type LevelField = 'price' | 'stopLoss' | 'takeProfit';

/** A line dragged to a new price: on the draft (`target: 'draft'`) or on a trade (its id). */
export interface LevelMove {
  target: string;
  field: LevelField;
  price: number;
}

/** The × of a stop loss or take profit label: on the draft or on a trade. */
export interface LevelRemove {
  target: string;
  field: 'stopLoss' | 'takeProfit';
}

type LabelAction =
  | { kind: 'close'; tradeId: string; label: string }
  | { kind: 'remove'; level: LevelRemove; label: string }
  | { kind: 'erase'; drawingId: number; label: string };

/** The box on a line, as TradingView draws it: text, P/L and a × button. */
interface LineLabel {
  /** The side, at the start of the box; on the order being set up, a button that places it. */
  badge?: { text: string; side: TradeSide; submit: boolean };
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

/** An order picked from the "+" menu, at the price where it was opened. */
export interface OrderAt {
  side: TradeSide;
  orderType: Exclude<OrderType, 'market'>;
  price: number;
  /** Places it at once; otherwise it only fills in the order panel. */
  place: boolean;
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
}

interface PlacedLabel extends LineLabel {
  key: string;
  color: string;
  y: number;
  line: Line;
}

type Tool = 'hline' | 'trend' | 'rect' | 'fib';
/** Drawings made of two points: a trend line, a rectangle or a Fibonacci retracement. */
type TwoPointKind = 'trend' | 'rect' | 'fib';
type Drawing =
  | { id: number; kind: 'hline'; price: number }
  | { id: number; kind: TwoPointKind; points: [ChartPoint, ChartPoint] };
interface ChartPoint {
  time: number;
  price: number;
}

/** A rectangle or Fibonacci retracement placed on the chart, in pixels. */
interface PlacedShape {
  id: number;
  kind: 'rect' | 'fib';
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Fibonacci levels: their ratio, price and height. */
  levels: { ratio: number; price: number; y: number }[];
}

/** Retracement levels, as TradingView draws them by default. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/** How close (px) the pointer must be to a line to grab it. */
const GRAB_DISTANCE = 6;
const DRAWING_COLOR = '#2962ff';
const RSI_PANE_HEIGHT = 110;

/**
 * Candlestick chart for the replay (TradingView lightweight-charts, Apache-2.0), laid out like
 * TradingView. It draws the visible candles, a marker per entry and exit, and lines for the
 * order being set up, pending orders and open positions, each with a label showing its size and
 * P/L and a × to close the position, cancel the order or remove the SL/TP. Order prices, stop
 * losses and take profits can be dragged by the line or its label; each drop emits
 * `levelMoved` and the page decides whether to accept it.
 *
 * A toolbar adds indicators (moving averages, RSI in its own pane) and drawings (horizontal
 * and trend lines, rectangles and Fibonacci retracements). Indicators only use the candles
 * shown, so they never peek ahead.
 */
@Component({
  selector: 'app-replay-chart',
  imports: [DecimalPipe],
  host: {
    '(document:pointerdown)': 'closeMenu($event)',
    '(document:keydown.escape)': 'menu.set(null)',
  },
  templateUrl: './replay-chart.html',
  styleUrl: './replay-chart.scss',
})
export class ReplayChart {
  readonly candles = input.required<Candle[]>();
  readonly trades = input<PracticeTrade[]>([]);
  readonly draft = input<OrderDraft | null>(null);
  /** Hides dates on the time axis and crosshair so students cannot look up what comes next. */
  readonly hideDates = input(false);
  /** Shows the indicators and drawing toolbar. */
  readonly tools = input(true);
  /** Length of a bar in seconds: trade markers and drawings snap to the bar they fall in. */
  readonly barSeconds = input(0);
  readonly levelMoved = output<LevelMove>();
  readonly levelRemoved = output<LevelRemove>();
  /** The × of a position (close it) or pending order (cancel it). */
  readonly tradeClosed = output<string>();
  /** The side button on the line of the order being set up. */
  readonly draftSubmitted = output<void>();
  readonly orderAt = output<OrderAt>();
  /** Symbol named in the "+" menu. */
  readonly symbol = input('');

  protected readonly indicators = INDICATORS;
  protected readonly signed = signedMoney;
  protected readonly priceDigits = priceDigits;
  protected readonly active = signal<ReadonlySet<string>>(new Set());
  protected readonly tool = signal<Tool | null>(null);
  /** First point of a trend line being drawn. */
  protected readonly anchor = signal<ChartPoint | null>(null);
  protected readonly drawings = signal<Drawing[]>([]);
  protected readonly labels = signal<PlacedLabel[]>([]);
  protected readonly shapes = signal<PlacedShape[]>([]);
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
    const lots = formatLots((this.draft()?.quantity ?? 0) / LOT_SIZE);
    const below = menu.price < close;
    return (['long', 'short'] as const).map((side) => {
      const orderType: OrderAt['orderType'] = (side === 'long') === below ? 'limit' : 'stop';
      return {
        side,
        orderType,
        text: `${side === 'long' ? 'Comprar' : 'Vender'} ${lots} ${this.symbol()} @`,
        type: orderType === 'limit' ? 'límite' : 'stop',
      };
    });
  });
  /** The last close, as a signal for the menu. */
  private readonly drawnClose = signal<number | null>(null);
  protected readonly toolHints: Record<Tool, [string, string]> = {
    hline: ['Haz clic en el gráfico para poner la línea.', ''],
    trend: ['Haz clic en el primer punto de la línea.', 'Haz clic en el segundo punto.'],
    rect: ['Haz clic en una esquina del rectángulo.', 'Haz clic en la esquina opuesta.'],
    fib: ['Haz clic en el inicio del movimiento.', 'Haz clic en el final del movimiento.'],
  };
  /** Width of the price scale, so labels sit just left of it. */
  protected readonly scaleWidth = signal(0);

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
  };
  private drawn: Candle[] = [];
  private indicatorSeries = new Map<string, ISeriesApi<'Line'>>();
  private trendSeries = new Map<number, ISeriesApi<'Line'>>();
  private nextDrawingId = 1;
  private colors = { up: '', down: '', text: '', muted: '' };

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      const css = getComputedStyle(host);
      const color = (name: string, fallback: string) =>
        css.getPropertyValue(name).trim() || fallback;
      this.colors = {
        up: color('--color-up', '#0f7b4d'),
        down: color('--color-down', '#b3261e'),
        text: color('--color-text', '#111111'),
        muted: color('--color-muted', '#5f5f5f'),
      };
      const { up, down } = this.colors;

      this.chart = createChart(this.canvas().nativeElement, {
        autoSize: true,
        layout: {
          background: { color: color('--color-bg', '#ffffff') },
          textColor: this.colors.text,
        },
        grid: {
          vertLines: { color: color('--color-surface', '#f5f5f5') },
          horzLines: { color: color('--color-surface', '#f5f5f5') },
        },
        timeScale: { timeVisible: true, rightOffset: 8 },
      });
      this.series = this.chart.addSeries(CandlestickSeries, {
        upColor: up,
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
      });
      this.markers = createSeriesMarkers(this.series, []);
      this.draw(untracked(this.candles));
      this.applyDates(untracked(this.hideDates));
      this.drawTrades(untracked(this.trades), untracked(this.draft));
      this.drawIndicators(untracked(this.candles), untracked(this.active));
      this.listen();
      // Labels follow their lines when the chart scrolls, zooms or resizes.
      const relayout = () => this.layoutLabels();
      this.chart.timeScale().subscribeVisibleLogicalRangeChange(relayout);
      this.chart.timeScale().subscribeSizeChange(relayout);
      this.chart.subscribeCrosshairMove(relayout);
      // The chart's own click event drops a second click within half a second (it waits for a
      // double click), so drawings listen to the DOM.
      const canvas = this.canvas().nativeElement;
      canvas.addEventListener('click', (event) => {
        const box = canvas.getBoundingClientRect();
        this.onChartClick(event.clientX - box.left, event.clientY - box.top);
      });
    });

    effect(() => this.draw(this.candles()));
    effect(() => this.applyDates(this.hideDates()));
    effect(() => this.drawTrades(this.trades(), this.draft(), this.drawings()));
    effect(() => this.drawIndicators(this.candles(), this.active()));
    effect(() => this.drawTrends(this.drawings(), this.barSeconds()));
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

  /** Picks a drawing tool; picking it again puts it down. */
  protected pick(tool: Tool): void {
    this.tool.update((current) => (current === tool ? null : tool));
    this.anchor.set(null);
  }

  protected clearDrawings(): void {
    this.drawings.set([]);
    this.tool.set(null);
    this.anchor.set(null);
  }

  /** The × of a label. */
  protected act(action: LabelAction): void {
    if (action.kind === 'close') {
      this.tradeClosed.emit(action.tradeId);
    } else if (action.kind === 'remove') {
      this.levelRemoved.emit(action.level);
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
    if (!(target instanceof Element && target.closest('.plus, .plus-menu'))) {
      this.menu.set(null);
    }
  }

  /** A buy or sell from the "+" menu, placed at once. */
  protected placeAt(side: TradeSide, orderType: OrderAt['orderType']): void {
    const menu = this.menu();
    this.menu.set(null);
    if (menu) {
      this.orderAt.emit({ side, orderType, price: menu.price, place: true });
    }
  }

  /** "Add order": the order panel's side, as a limit or stop at the menu's price. */
  protected addOrderAt(): void {
    const menu = this.menu();
    const order = this.menuOrders().find((o) => o.side === (this.draft()?.side ?? 'long'));
    this.menu.set(null);
    if (menu && order) {
      this.orderAt.emit({
        side: order.side,
        orderType: order.orderType,
        price: menu.price,
        place: false,
      });
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
      // student had dragged the price scale, and shows the latest bar.
      this.chart?.priceScale('right').applyOptions({ autoScale: true });
      this.chart?.timeScale().scrollToRealTime();
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
        text: long ? 'Compra' : 'Venta',
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
    const lines: Line[] = [];
    for (const t of trades) {
      const lots = formatLots(tradeLots(t));
      const badge = { text: t.side === 'long' ? 'Compra' : 'Venta', side: t.side, submit: false };
      if (t.status === 'open') {
        lines.push({
          key: t.id,
          price: t.entryPrice,
          color: text,
          style: LineStyle.Solid,
          position: t,
          bracket: { target: t.id, side: t.side, quantity: t.quantity },
          label: {
            badge,
            text: lots,
            pnl: null,
            action: { kind: 'close', tradeId: t.id, label: 'Cerrar posición' },
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
            text: `${lots} ${ORDER_TYPES[t.orderType]}`,
            pnl: null,
            action: { kind: 'close', tradeId: t.id, label: 'Cancelar orden' },
          },
        });
        lines.push(...this.stops(t.id, t, () => t.orderPrice, t.quantity, LineStyle.Dashed));
      }
    }
    if (draft) {
      const lots = formatLots((draft.quantity ?? 0) / LOT_SIZE);
      const label = {
        badge: {
          text: draft.side === 'long' ? 'Comprar' : 'Vender',
          side: draft.side,
          submit: true,
        },
        text: `${lots} ${ORDER_TYPES[draft.orderType]}`,
        pnl: null,
        action: null,
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
          bracket: { target: 'draft', side: draft.side, quantity: draft.quantity },
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
            action: { kind: 'erase', drawingId: d.id, label: 'Borrar línea' },
          },
        });
      }
    }
    return lines;
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
      pnlAt: known ? pnlAt : undefined,
      label: {
        text: `${stop ? 'SL' : 'TP'}${quantity ? ` ${formatLots(quantity / LOT_SIZE)}` : ''}`,
        pnl: known ? pnlAt(price) : null,
        action: {
          kind: 'remove',
          level: { target, field },
          label: `Quitar ${stop ? 'stop loss' : 'take profit'}`,
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
    this.scaleWidth.set(this.chart.priceScale('right').width());
    this.shapes.set(this.placeShapes());
  }

  /** Rectangles and Fibonacci retracements in pixels, for the overlay. */
  private placeShapes(): PlacedShape[] {
    const series = this.series!;
    const shapes: PlacedShape[] = [];
    for (const d of untracked(this.drawings)) {
      if (d.kind !== 'rect' && d.kind !== 'fib') {
        continue;
      }
      const [a, b] = d.points;
      const xa = this.timeToX(a.time);
      const xb = this.timeToX(b.time);
      const ya = series.priceToCoordinate(a.price);
      const yb = series.priceToCoordinate(b.price);
      if (xa === null || xb === null || ya === null || yb === null) {
        continue;
      }
      // A retracement runs from the end of the move (0) back to its start (1).
      const levels =
        d.kind === 'fib'
          ? FIB_LEVELS.map((ratio) => {
              const price = roundPrice(b.price + (a.price - b.price) * ratio);
              return { ratio, price, y: series.priceToCoordinate(price) ?? 0 };
            })
          : [];
      shapes.push({
        id: d.id,
        kind: d.kind,
        left: Math.min(xa, xb),
        right: Math.max(xa, xb),
        top: Math.min(ya, yb),
        bottom: Math.max(ya, yb),
        levels,
      });
    }
    return shapes;
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
    const candles = this.drawn;
    if (!candles.length || !this.chart) {
      return null;
    }
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
    return this.chart.timeScale().logicalToCoordinate(low as Logical);
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
        computeIndicator(indicator, candles).map((p) => ({ time: p.time as Time, value: p.value })),
      );
    }
  }

  /** Redraws the trend lines, their ends snapped to the bars of the current timeframe. */
  private drawTrends(drawings: Drawing[], barSeconds: number): void {
    const chart = this.chart;
    if (!chart) {
      return;
    }
    this.trendSeries.forEach((series) => chart.removeSeries(series));
    this.trendSeries.clear();
    const bar = this.snap(barSeconds);
    for (const d of drawings) {
      if (d.kind !== 'trend' || bar(d.points[0].time) === bar(d.points[1].time)) {
        continue;
      }
      const series = chart.addSeries(LineSeries, {
        color: DRAWING_COLOR,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
      });
      series.setData(d.points.map((p) => ({ time: bar(p.time) as Time, value: p.price })));
      this.trendSeries.set(d.id, series);
    }
  }

  /** Maps a time to the start of its bar. */
  private snap(barSeconds: number): (time: number) => number {
    return (time) => (barSeconds > 0 ? Math.floor(time / barSeconds) * barSeconds : time);
  }

  /** Places a horizontal line, or the two points of a trend line, where the student clicks. */
  private onChartClick(x: number, y: number): void {
    const tool = untracked(this.tool);
    const chart = this.chart;
    // Only clicks on the candles' pane count, not on the scales or the RSI pane.
    if (
      !tool ||
      !this.series ||
      !chart ||
      x > chart.timeScale().width() ||
      y > chart.panes()[0].getHeight()
    ) {
      return;
    }
    const raw = this.series.coordinateToPrice(y);
    if (raw === null || raw <= 0) {
      return;
    }
    const price = roundPrice(raw);
    const id = this.nextDrawingId++;
    if (tool === 'hline') {
      this.drawings.update((list) => [...list, { id, kind: 'hline', price }]);
      this.tool.set(null);
      return;
    }
    const time = this.xToTime(x);
    if (time === null) {
      return;
    }
    const point = { time, price };
    const anchor = untracked(this.anchor);
    if (!anchor) {
      this.anchor.set(point);
      return;
    }
    if (anchor.time === point.time && tool === 'trend') {
      return;
    }
    // A retracement keeps the order of the move; the other drawings go left to right.
    const points = (
      tool === 'fib' ? [anchor, point] : [anchor, point].sort((a, b) => a.time - b.time)
    ) as [ChartPoint, ChartPoint];
    this.drawings.update((list) => [...list, { id, kind: tool, points }]);
    this.anchor.set(null);
    this.tool.set(null);
  }

  private startDrag(entry: { line: Line; api: IPriceLine }, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const bracket = entry.line.drag ? undefined : entry.line.bracket;
    if (bracket) {
      // Dragging away from an entry pulls out a new take profit or stop loss.
      const price = entry.line.price;
      const line = this.levelLine(
        bracket.target,
        bracket.side,
        'takeProfit',
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
      this.dragging = { line, api, price, bracket, origin: price };
    } else {
      this.dragging = { ...entry, price: entry.line.price, origin: entry.line.price };
    }
    this.chart!.applyOptions({ handleScroll: false, handleScale: false });
    this.stage().nativeElement.setPointerCapture?.(event.pointerId);
  }

  /** Lets the pointer grab draggable lines; the chart pans and zooms as usual elsewhere. */
  private listen(): void {
    const stage = this.stage().nativeElement;
    const y = (event: PointerEvent) => event.clientY - stage.getBoundingClientRect().top;
    /** The draggable line closest to the pointer, if one is within reach. */
    const near = (event: PointerEvent) => {
      let best: (typeof this.priceLines)[number] | undefined;
      let bestDistance = GRAB_DISTANCE;
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

    // Capture phase, so a grab never reaches the chart's own pan handling.
    this.canvas().nativeElement.addEventListener(
      'pointerdown',
      (event) => {
        const hit = untracked(this.tool) ? undefined : near(event);
        if (hit) {
          this.startDrag(hit, event);
        }
      },
      { capture: true },
    );
    stage.addEventListener(
      'pointermove',
      (event) => {
        if (!this.dragging) {
          stage.style.cursor = untracked(this.tool) ? 'crosshair' : near(event) ? 'ns-resize' : '';
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
      const dragging = this.dragging;
      if (!dragging) {
        return;
      }
      event.stopPropagation();
      this.dragging = undefined;
      this.chart!.applyOptions({ handleScroll: true, handleScale: true });
      const { target, field } = dragging.line.drag!;
      if (dragging.bracket && dragging.price === dragging.origin) {
        this.drawTrades(this.trades(), this.draft());
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
      this.levelMoved.emit({ target, field, price: dragging.price });
      // If the page rejects the move its inputs stay the same, so put the line back.
      setTimeout(() => this.drawTrades(this.trades(), this.draft()));
    };
    stage.addEventListener('pointerleave', () => this.hoverY.set(null));
    stage.addEventListener('pointerup', drop, { capture: true });
    stage.addEventListener('pointercancel', drop, { capture: true });
  }

  /** Whether the pointer is over the candles of a live practice, where "+" is offered. */
  private overCandles(event: PointerEvent): boolean {
    const chart = this.chart;
    if (!chart || !untracked(this.draft) || untracked(this.tool)) {
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
