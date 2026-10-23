import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
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
import { Candle, PracticeTrade } from '../../core/models/practice';

/**
 * Candlestick chart for the replay (TradingView lightweight-charts, Apache-2.0). It draws the
 * visible candles, a marker per entry and exit, and price lines for each open trade.
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
  /** Hides dates on the time axis and crosshair so students cannot look up what comes next. */
  readonly hideDates = input(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private markers?: ISeriesMarkersPluginApi<Time>;
  private priceLines: IPriceLine[] = [];
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
      this.drawTrades(untracked(this.trades));
    });

    effect(() => this.draw(this.candles()));
    effect(() => this.applyDates(this.hideDates()));
    effect(() => this.drawTrades(this.trades()));
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

  private drawTrades(trades: PracticeTrade[]): void {
    if (!this.series || !this.markers) {
      return;
    }
    const { up, down, text, muted } = this.colors;
    const markers: SeriesMarker<Time>[] = [];
    for (const t of trades) {
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

    this.priceLines.forEach((line) => this.series!.removePriceLine(line));
    this.priceLines = trades
      .filter((t) => t.status === 'open')
      .flatMap((t) => [
        { price: t.entryPrice, color: text, title: t.side === 'long' ? 'Compra' : 'Venta' },
        ...(t.stopLoss !== null ? [{ price: t.stopLoss, color: down, title: 'SL' }] : []),
        ...(t.takeProfit !== null ? [{ price: t.takeProfit, color: up, title: 'TP' }] : []),
      ])
      .map((line) =>
        this.series!.createPriceLine({ ...line, lineWidth: 1, lineStyle: LineStyle.Dashed }),
      );
  }

  private point(candle: Candle) {
    return { ...candle, time: candle.time as Time };
  }
}
