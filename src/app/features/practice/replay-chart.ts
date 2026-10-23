import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import {
  CandlestickSeries,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineStyle,
  SeriesMarker,
  Time,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts';
import { Candle, OrderType, PracticeTrade, TradeSide } from '../../core/models/practice';
import { orderLabel, roundPrice } from './practice-format';

/** The order being set up in the ticket, drawn as draggable lines before it is placed. */
export interface OrderDraft {
  side: TradeSide;
  orderType: OrderType;
  price: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
}

export type LevelField = 'price' | 'stopLoss' | 'takeProfit';

/** A line dragged to a new price: on the draft (`target: 'draft'`) or on a trade (its id). */
export interface LevelMove {
  target: string;
  field: LevelField;
  price: number;
}

interface Line {
  price: number;
  title: string;
  color: string;
  style: LineStyle;
  /** Set when the line can be dragged. */
  drag?: { target: string; field: LevelField };
}

/** How close (px) the pointer must be to a line to grab it. */
const GRAB_DISTANCE = 6;

/**
 * Candlestick chart for the replay (TradingView lightweight-charts, Apache-2.0). It draws the
 * visible candles, a marker per entry and exit, and price lines for the order being set up,
 * pending orders and open trades. Order prices, stop losses and take profits can be dragged;
 * each drop emits `levelMoved` and the page decides whether to accept it.
 */
@Component({
  selector: 'app-replay-chart',
  template: '',
  styles: `
    :host {
      display: block;
      height: 420px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      overflow: hidden;
    }
  `,
})
export class ReplayChart {
  readonly candles = input.required<Candle[]>();
  readonly trades = input<PracticeTrade[]>([]);
  readonly draft = input<OrderDraft | null>(null);
  /** Hides dates on the time axis and crosshair so students cannot look up what comes next. */
  readonly hideDates = input(false);
  readonly levelMoved = output<LevelMove>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private markers?: ISeriesMarkersPluginApi<Time>;
  private priceLines: { line: Line; api: IPriceLine }[] = [];
  private dragging?: { line: Line; api: IPriceLine; price: number };
  private drawn: Candle[] = [];
  private colors = { up: '', down: '', text: '', muted: '' };

  constructor() {
    afterNextRender(() => {
      const css = getComputedStyle(this.host);
      const color = (name: string, fallback: string) =>
        css.getPropertyValue(name).trim() || fallback;
      this.colors = {
        up: color('--color-up', '#0f7b4d'),
        down: color('--color-down', '#b3261e'),
        text: color('--color-text', '#111111'),
        muted: color('--color-muted', '#5f5f5f'),
      };
      const { up, down } = this.colors;

      this.chart = createChart(this.host, {
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
      this.listen();
    });

    effect(() => this.draw(this.candles()));
    effect(() => this.applyDates(this.hideDates()));
    effect(() => this.drawTrades(this.trades(), this.draft()));
    inject(DestroyRef).onDestroy(() => this.chart?.remove());
  }

  /** Appends the new candle when the replay steps forward; redraws everything otherwise. */
  private draw(candles: Candle[]): void {
    if (!this.series) {
      return;
    }
    const previous = this.drawn;
    const isNextStep =
      previous.length > 0 &&
      candles.length === previous.length + 1 &&
      candles[0] === previous[0] &&
      candles[previous.length - 1] === previous[previous.length - 1];
    if (isNextStep) {
      this.series.update(this.point(candles[candles.length - 1]));
    } else {
      this.series.setData(candles.map((c) => this.point(c)));
      this.chart?.timeScale().scrollToRealTime();
    }
    this.drawn = candles;
  }

  private applyDates(hide: boolean): void {
    this.chart?.applyOptions({
      localization: { timeFormatter: hide ? () => '' : undefined },
      timeScale: { tickMarkFormatter: hide ? () => '' : undefined },
    });
  }

  private drawTrades(trades: PracticeTrade[], draft: OrderDraft | null): void {
    if (!this.series || !this.markers) {
      return;
    }
    const { up, down, muted } = this.colors;
    const markers: SeriesMarker<Time>[] = [];
    for (const t of trades) {
      if (t.status !== 'open' && t.status !== 'closed') {
        continue;
      }
      const long = t.side === 'long';
      markers.push({
        time: t.entryTime as Time,
        position: long ? 'belowBar' : 'aboveBar',
        shape: long ? 'arrowUp' : 'arrowDown',
        color: long ? up : down,
        text: long ? 'Compra' : 'Venta',
      });
      if (t.status === 'closed' && t.exitTime !== undefined) {
        markers.push({
          time: t.exitTime as Time,
          position: long ? 'aboveBar' : 'belowBar',
          shape: 'circle',
          color: muted,
          text: `${(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnl ?? 0).toFixed(2)}`,
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    this.markers.setMarkers(markers);

    this.priceLines.forEach(({ api }) => this.series!.removePriceLine(api));
    this.priceLines = this.lines(trades, draft).map((line) => ({
      line,
      api: this.series!.createPriceLine({
        price: line.price,
        color: line.color,
        title: line.title,
        lineWidth: line.drag ? 2 : 1,
        lineStyle: line.style,
      }),
    }));
  }

  private lines(trades: PracticeTrade[], draft: OrderDraft | null): Line[] {
    const { up, down, text, muted } = this.colors;
    const stops = (
      target: string,
      t: Pick<OrderDraft, 'stopLoss' | 'takeProfit'>,
      style: LineStyle,
    ) => [
      ...(t.stopLoss !== null
        ? [
            {
              price: t.stopLoss,
              color: down,
              title: 'SL',
              style,
              drag: { target, field: 'stopLoss' as const },
            },
          ]
        : []),
      ...(t.takeProfit !== null
        ? [
            {
              price: t.takeProfit,
              color: up,
              title: 'TP',
              style,
              drag: { target, field: 'takeProfit' as const },
            },
          ]
        : []),
    ];
    const lines: Line[] = [];
    for (const t of trades) {
      if (t.status === 'open') {
        lines.push({
          price: t.entryPrice,
          color: text,
          title: orderLabel({ ...t, orderType: 'market' }),
          style: LineStyle.Solid,
        });
        lines.push(...stops(t.id, t, LineStyle.Dashed));
      } else if (t.status === 'pending') {
        lines.push({
          price: t.orderPrice!,
          color: text,
          title: orderLabel(t),
          style: LineStyle.Dashed,
          drag: { target: t.id, field: 'price' },
        });
        lines.push(...stops(t.id, t, LineStyle.Dashed));
      }
    }
    if (draft) {
      if (draft.orderType !== 'market' && draft.price !== null) {
        lines.push({
          price: draft.price,
          color: muted,
          title: `Nueva ${orderLabel(draft).toLowerCase()}`,
          style: LineStyle.Dotted,
          drag: { target: 'draft', field: 'price' },
        });
      }
      lines.push(...stops('draft', draft, LineStyle.Dotted));
    }
    return lines;
  }

  /** Lets the pointer grab draggable lines; the chart pans and zooms as usual elsewhere. */
  private listen(): void {
    const y = (event: PointerEvent) => event.clientY - this.host.getBoundingClientRect().top;
    /** The draggable line closest to the pointer, if one is within reach. */
    const near = (event: PointerEvent) => {
      let best: (typeof this.priceLines)[number] | undefined;
      let bestDistance = GRAB_DISTANCE;
      for (const entry of this.priceLines) {
        const at = entry.line.drag ? this.series!.priceToCoordinate(entry.line.price) : null;
        const distance = at === null ? Infinity : Math.abs(at - y(event));
        if (distance <= bestDistance) {
          best = entry;
          bestDistance = distance;
        }
      }
      return best;
    };

    // Capture phase, so a grab never reaches the chart's own pan handling.
    this.host.addEventListener(
      'pointerdown',
      (event) => {
        const hit = near(event);
        if (!hit) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.dragging = { ...hit, price: hit.line.price };
        this.chart!.applyOptions({ handleScroll: false, handleScale: false });
        this.host.setPointerCapture?.(event.pointerId);
      },
      { capture: true },
    );
    this.host.addEventListener(
      'pointermove',
      (event) => {
        if (!this.dragging) {
          this.host.style.cursor = near(event) ? 'ns-resize' : '';
          return;
        }
        event.stopPropagation();
        const price = this.series!.coordinateToPrice(y(event));
        if (price !== null && price > 0) {
          this.dragging.price = roundPrice(price);
          this.dragging.api.applyOptions({ price: this.dragging.price });
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
      this.levelMoved.emit({ ...dragging.line.drag!, price: dragging.price });
      // If the page rejects the move its inputs stay the same, so put the line back.
      setTimeout(() => this.drawTrades(this.trades(), this.draft()));
    };
    this.host.addEventListener('pointerup', drop, { capture: true });
    this.host.addEventListener('pointercancel', drop, { capture: true });
  }

  private point(candle: Candle) {
    return { ...candle, time: candle.time as Time };
  }
}
