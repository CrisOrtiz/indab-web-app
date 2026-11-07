import {
  BaselineSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
  LineStyle,
  LineWidth,
  SeriesType,
  Time,
  WhitespaceData,
  createSeriesMarkers,
} from 'lightweight-charts';
import { Candle } from '../../core/models/practice';
import {
  Divergence,
  Indicator,
  IndicatorConfig,
  IndicatorPoint,
  PlotPoint,
  RSI_COLORS,
  RSI_LEVELS,
  RSI_OVERBOUGHT,
  RSI_OVERSOLD,
  STOCHASTIC_LEVELS,
  computeIndicator,
  fade,
  rsiDivergences,
} from './indicators';
import { roundPrice } from './practice-format';

/** Height (px) of an indicator's pane under the candles when it is the only one. */
export const INDICATOR_PANE_HEIGHT = 110;
/** With several panes under the candles: how much taller the candles' pane is than each. */
export const CANDLES_STRETCH = 2.5;

/** Colors of the page the indicators use: their guides and the volume bars. */
export interface IndicatorColors {
  muted: string;
  candleUp: string;
  candleDown: string;
}

/** An indicator to draw with the user's setup. */
export interface ShownIndicator {
  indicator: Indicator;
  config: IndicatorConfig;
}

/** An indicator on the chart: its series, and how to feed them the candles shown. */
interface Drawn {
  series: ISeriesApi<SeriesType>[];
  update: (candles: Candle[]) => void;
}

const QUIET = {
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
};

const data = (points: PlotPoint[], price: boolean): (LineData<Time> | WhitespaceData<Time>)[] =>
  points.map((p) =>
    p.value === undefined
      ? { time: p.time as Time }
      : {
          time: p.time as Time,
          // Prices at price precision: float noise on flat prices would stretch the scale.
          value: price ? roundPrice(p.value) : p.value,
          ...(p.color ? { color: p.color } : {}),
        },
  );

/**
 * Draws the indicators switched on, each with its user's setup: those on the candles in the
 * candles' pane, the others (RSI, MACD, Stochastic, ATR) each in a pane of its own, in menu
 * order. A change of indicators or of any setup draws them all again (panes are numbered in
 * order, and lightweight-charts drops a pane once its last series goes); new candles only feed
 * them.
 */
export class ChartIndicators {
  private drawn: Drawn[] = [];
  private layout = '';

  constructor(
    private readonly chart: IChartApi,
    private readonly colors: () => IndicatorColors,
  ) {}

  draw(candles: Candle[], shown: ShownIndicator[]): void {
    const layout = JSON.stringify(shown.map(({ indicator, config }) => [indicator.id, config]));
    if (layout !== this.layout) {
      this.clear();
      this.layout = layout;
      let pane = 0;
      this.drawn = shown.map(({ indicator, config }) =>
        this.build(indicator, config, indicator.pane === 'own' ? ++pane : 0),
      );
      // The candles keep most of the chart: one pane under them is as tall as the RSI's always
      // was; several share the rest, each a part of what the candles get.
      const panes = this.chart.panes();
      if (pane === 1) {
        panes[1]?.setHeight(INDICATOR_PANE_HEIGHT);
      } else if (pane > 1) {
        panes.forEach((p, i) => p.setStretchFactor(i === 0 ? CANDLES_STRETCH : 1));
      }
    }
    this.drawn.forEach((d) => d.update(candles));
  }

  /** Takes every indicator off the chart. */
  clear(): void {
    this.drawn.flatMap((d) => d.series).forEach((s) => this.chart.removeSeries(s));
    this.drawn = [];
    this.layout = '';
  }

  private build(indicator: Indicator, config: IndicatorConfig, pane: number): Drawn {
    const chart = this.chart;
    const price = pane === 0;
    const series: ISeriesApi<SeriesType>[] = [];
    const line = (key: string, extra: object = {}) => {
      const s = chart.addSeries(
        LineSeries,
        {
          ...QUIET,
          color: config.colors[key],
          lineWidth: (config.widths[key] ?? 1) as LineWidth,
          ...extra,
        },
        pane,
      );
      series.push(s);
      return s;
    };
    const guides = (s: ISeriesApi<'Line'>, levels: number[], color: (level: number) => string) =>
      levels.forEach((level) =>
        s.createPriceLine({
          price: level,
          color: color(level),
          lineStyle: LineStyle.Dotted,
          lineWidth: 1,
          axisLabelVisible: false,
          title: '',
        }),
      );
    // The main line of a pane of its own shows its last value on the scale.
    const main = price ? {} : { lastValueVisible: true };
    const compute = (candles: Candle[]) => computeIndicator(indicator, candles, config);
    const feed =
      (lines: Record<string, ISeriesApi<'Line'>>) =>
      (candles: Candle[]): void => {
        const { plots } = compute(candles);
        Object.entries(lines).forEach(([key, s]) => s.setData(data(plots[key], price)));
      };
    const muted = () => this.colors().muted;
    const result = (update: (candles: Candle[]) => void): Drawn => ({ series, update });

    switch (indicator.kind) {
      case 'volume': {
        // Bars along the foot of the candles, on a scale of their own, as in TradingView.
        const bars = chart.addSeries(
          HistogramSeries,
          {
            priceScaleId: 'volume',
            priceFormat: { type: 'volume' },
            priceLineVisible: false,
            lastValueVisible: false,
          },
          0,
        );
        bars.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        series.push(bars);
        return result((candles) => {
          // Each bar in its candle's color, faded so the candles stay in front.
          const { candleUp, candleDown } = this.colors();
          bars.setData(
            compute(candles).plots['volume'].map((p, i) => ({
              time: p.time as Time,
              value: p.value!,
              color: fade(candles[i].close >= candles[i].open ? candleUp : candleDown),
            })),
          );
        });
      }
      case 'rsi':
        return result(this.rsi(indicator, config, pane, series, line, guides));
      case 'macd': {
        const histogram = chart.addSeries(HistogramSeries, { ...QUIET }, pane);
        series.push(histogram);
        const lines = { macd: line('macd', main), signal: line('signal') };
        guides(lines.macd, [0], muted);
        return result((candles) => {
          feed(lines)(candles);
          histogram.setData(data(compute(candles).plots['histogram'], false));
        });
      }
      case 'stochastic': {
        const lines = { k: line('k', main), d: line('d') };
        guides(lines.k, STOCHASTIC_LEVELS, muted);
        return result(feed(lines));
      }
      case 'supertrend': {
        // One line, green under the price going up and red above it going down. Each bar's
        // color paints the segment to the next, so the bar before a flip is transparent: the
        // line breaks there instead of jumping across the candles, as in TradingView.
        const trend = line('up');
        const marks = createSeriesMarkers(trend, []);
        return result((candles) => {
          const { plots, signals } = compute(candles);
          const { up, down } = plots;
          trend.setData(
            data(
              up.map((p, i) => {
                const rising = p.value !== undefined;
                const flips = i + 1 < up.length && (up[i + 1].value !== undefined) !== rising;
                return {
                  time: p.time,
                  value: rising ? p.value : down[i].value,
                  color: flips ? 'transparent' : config.colors[rising ? 'up' : 'down'],
                };
              }),
              true,
            ),
          );
          // Buy and sell labels where the trend flips, as TradingView's "Supertrend" signals.
          marks.setMarkers(
            signals.map((s) => ({
              time: s.time as Time,
              position: s.kind === 'buy' ? 'belowBar' : 'aboveBar',
              shape: s.kind === 'buy' ? 'arrowUp' : 'arrowDown',
              color: s.kind === 'buy' ? config.colors['up'] : config.colors['down'],
              text: s.kind === 'buy' ? 'BUY' : 'SELL',
            })),
          );
        });
      }
      case 'vwap': {
        // A new average each day: the last bar of a day doesn't join the next day's first.
        const vwap = line('vwap');
        return result((candles) => {
          const points = compute(candles).plots['vwap'];
          const day = (t: number) => Math.floor(t / 86_400);
          vwap.setData(
            data(
              points.map((p, i) =>
                i + 1 < points.length && day(points[i + 1].time) !== day(p.time)
                  ? { ...p, color: 'transparent' }
                  : p,
              ),
              true,
            ),
          );
        });
      }
      default: {
        // Lines only: EMA, Bollinger Bands, ATR.
        const lines = Object.fromEntries(
          indicator.plots.map((plot, i) => [plot.key, line(plot.key, i === 0 ? main : {})]),
        );
        return result(feed(lines));
      }
    }
  }

  /**
   * The RSI with its dotted guides, its smoothing average, its overbought and oversold zones
   * shaded red and green and, unless switched off, its divergences as TradingView draws them:
   * green "Bull" and red "Bear" lines between the RSI pivots that diverge from the price.
   */
  private rsi(
    indicator: Indicator,
    config: IndicatorConfig,
    pane: number,
    series: ISeriesApi<SeriesType>[],
    line: (key: string, extra?: object) => ISeriesApi<'Line'>,
    guides: (s: ISeriesApi<'Line'>, levels: number[], color: (level: number) => string) => void,
  ): (candles: Candle[]) => void {
    const chart = this.chart;
    const rsi = line('rsi', { lastValueVisible: true });
    // The overbought and oversold limits in the colors of their zones.
    guides(rsi, RSI_LEVELS, (level) =>
      level === RSI_OVERBOUGHT
        ? RSI_COLORS.bear
        : level === RSI_OVERSOLD
          ? RSI_COLORS.bull
          : this.colors().muted,
    );
    // The RSI alone sets its pane's scale, not these lines, shades or labels.
    const quiet = { ...QUIET, autoscaleInfoProvider: () => null };
    const smoothing = line('smoothing', quiet);
    const zone = (level: number, color: string, above: boolean) => {
      const s = chart.addSeries(
        BaselineSeries,
        {
          ...quiet,
          baseValue: { type: 'price', price: level },
          lineVisible: false,
          topFillColor1: above ? color : 'transparent',
          topFillColor2: above ? color : 'transparent',
          bottomFillColor1: above ? 'transparent' : color,
          bottomFillColor2: above ? 'transparent' : color,
        },
        pane,
      );
      series.push(s);
      return s;
    };
    const zones = [
      zone(RSI_OVERBOUGHT, fade(RSI_COLORS.bear, 0.25), true),
      zone(RSI_OVERSOLD, fade(RSI_COLORS.bull, 0.25), false),
    ];
    const divergences = config.inputs['divergences']
      ? (['bull', 'bear'] as const).map((kind) => {
          const s = chart.addSeries(
            LineSeries,
            { ...quiet, color: RSI_COLORS[kind], lineWidth: 2 },
            pane,
          );
          series.push(s);
          return { kind, line: s, marks: createSeriesMarkers(s, []) };
        })
      : [];
    return (candles) => {
      const { plots } = computeIndicator(indicator, candles, config);
      const points = plots['rsi'] as IndicatorPoint[];
      const rsiData = data(points, false);
      rsi.setData(rsiData);
      smoothing.setData(data(plots['smoothing'], false));
      zones.forEach((z) => z.setData(rsiData));
      if (!divergences.length) {
        return;
      }
      const found = rsiDivergences(candles, points);
      const times = points.map((p) => p.time);
      for (const { kind, line: s, marks } of divergences) {
        const list = found.filter((d) => d.kind === kind);
        s.setData(divergenceSegments(list, times));
        marks.setMarkers(
          list.map((d) => ({
            time: d.to.time as Time,
            position: kind === 'bull' ? 'belowBar' : 'aboveBar',
            shape: 'square',
            size: 0,
            color: RSI_COLORS[kind],
            text: kind === 'bull' ? 'Bull' : 'Bear',
          })),
        );
      }
    };
  }
}

/**
 * The divergences as one line series: each one a segment between its two pivots, with a gap
 * (a bar of `times` without value) before the next, or joined to it when they share a pivot. One that
 * starts before the previous ends is left out, as a series' times must go forward.
 */
export function divergenceSegments(
  list: Divergence[],
  times: number[],
): (LineData<Time> | WhitespaceData<Time>)[] {
  const data: (LineData<Time> | WhitespaceData<Time>)[] = [];
  let end = -Infinity;
  for (const { from, to } of list) {
    if (from.time < end) {
      continue;
    }
    if (from.time > end) {
      // Pivots of one kind are over 5 bars apart, so there is a bar between them.
      const gap = times.find((t) => t > end && t < from.time);
      if (data.length && gap !== undefined) {
        data.push({ time: gap as Time });
      }
      data.push({ time: from.time as Time, value: from.value });
    }
    data.push({ time: to.time as Time, value: to.value });
    end = to.time;
  }
  return data;
}
