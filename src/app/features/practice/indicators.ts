import { Candle } from '../../core/models/practice';

/** One value of an indicator, at a candle's time (seconds). */
export interface IndicatorPoint {
  time: number;
  value: number;
}

/** A point of a plot: no value leaves a gap (a SuperTrend line on the other side); its own color. */
export interface PlotPoint {
  time: number;
  value?: number;
  color?: string;
}

export type IndicatorKind =
  'ema' | 'rsi' | 'volume' | 'bollinger' | 'macd' | 'stochastic' | 'atr' | 'supertrend' | 'vwap';

/** A setting of the "Inputs" tab: a number (length, multiplier) or a switch. */
export interface IndicatorInput {
  key: string;
  type: 'number' | 'bool';
  value: number | boolean;
  min?: number;
  max?: number;
  step?: number;
}

/** A line (or the histogram's bars) of the "Style" tab: its color, and width for lines. */
export interface IndicatorPlot {
  key: string;
  color: string;
  /** Line width in px; histograms have none. */
  width?: number;
}

export interface Indicator {
  id: string;
  kind: IndicatorKind;
  /** On the candles, or in a pane of its own under them, as in TradingView. */
  pane: 'price' | 'own';
  /** The menu's swatch. */
  color: string;
  inputs: IndicatorInput[];
  plots: IndicatorPlot[];
}

/** What a user changed of an indicator in its settings dialog, kept for their next sessions. */
export interface IndicatorConfig {
  inputs: Record<string, number | boolean>;
  colors: Record<string, string>;
  widths: Record<string, number>;
  /** Timeframes (bar seconds) it is hidden on: TradingView's "Visibility" tab. */
  hidden: number[];
}

const length = (value: number, max = 500): IndicatorInput => ({
  key: 'length',
  type: 'number',
  value,
  min: 1,
  max,
  step: 1,
});
const whole = (key: string, value: number, max = 500): IndicatorInput => ({
  ...length(value, max),
  key,
});
const multiplier = (key: string, value: number): IndicatorInput => ({
  key,
  type: 'number',
  value,
  min: 0.1,
  max: 20,
  step: 0.1,
});
const toggle = (key: string, value: boolean): IndicatorInput => ({ key, type: 'bool', value });

/** TradingView's colors for the lines it draws by default. */
const BLUE = '#2962ff';
const ORANGE = '#ff6d00';
const GREEN = '#089981';
const RED = '#f23645';

/**
 * The indicators students can switch on. Cris trades with the EMA 100 and 200 (2026-10-26),
 * the RSI 14 with its smoothing and divergences, and volume; on 2026-11-06 Cris added the
 * classics with TradingView's default settings: Bollinger Bands, MACD, Stochastic, ATR,
 * SuperTrend and VWAP. Every one can be set up from its settings dialog (`IndicatorConfig`).
 * Volume is drawn as bars at the foot of the candles, in their colors.
 */
export const INDICATORS: Indicator[] = [
  {
    id: 'ema100',
    kind: 'ema',
    pane: 'price',
    color: '#ff9800',
    inputs: [length(100)],
    plots: [{ key: 'ema', color: '#ff9800', width: 2 }],
  },
  {
    id: 'ema200',
    kind: 'ema',
    pane: 'price',
    color: BLUE,
    inputs: [length(200)],
    plots: [{ key: 'ema', color: BLUE, width: 2 }],
  },
  {
    id: 'rsi14',
    kind: 'rsi',
    pane: 'own',
    color: '#7e57c2',
    inputs: [length(14, 100), whole('smoothing', 14, 100), toggle('divergences', true)],
    plots: [
      { key: 'rsi', color: '#7e57c2', width: 1 },
      { key: 'smoothing', color: '#fdd835', width: 1 },
    ],
  },
  { id: 'volume', kind: 'volume', pane: 'price', color: '#787b86', inputs: [], plots: [] },
  {
    id: 'bollinger',
    kind: 'bollinger',
    pane: 'price',
    color: ORANGE,
    inputs: [length(20), multiplier('mult', 2)],
    plots: [
      { key: 'basis', color: ORANGE, width: 1 },
      { key: 'upper', color: BLUE, width: 1 },
      { key: 'lower', color: BLUE, width: 1 },
    ],
  },
  {
    id: 'macd',
    kind: 'macd',
    pane: 'own',
    color: BLUE,
    inputs: [whole('fast', 12), whole('slow', 26), whole('signal', 9)],
    plots: [
      { key: 'macd', color: BLUE, width: 1 },
      { key: 'signal', color: ORANGE, width: 1 },
      { key: 'rising', color: '#26a69a' },
      { key: 'falling', color: '#ef5350' },
    ],
  },
  {
    id: 'stochastic',
    kind: 'stochastic',
    pane: 'own',
    color: BLUE,
    inputs: [whole('kLength', 14, 100), whole('kSmoothing', 1, 100), whole('dSmoothing', 3, 100)],
    plots: [
      { key: 'k', color: BLUE, width: 1 },
      { key: 'd', color: ORANGE, width: 1 },
    ],
  },
  {
    id: 'atr',
    kind: 'atr',
    pane: 'own',
    color: '#b71c1c',
    inputs: [length(14, 100)],
    plots: [{ key: 'atr', color: '#b71c1c', width: 1 }],
  },
  {
    id: 'supertrend',
    kind: 'supertrend',
    pane: 'price',
    color: GREEN,
    inputs: [whole('atrLength', 10, 100), multiplier('factor', 3), toggle('signals', true)],
    plots: [
      // One line in two colors: its width is the uptrend's.
      { key: 'up', color: GREEN, width: 2 },
      { key: 'down', color: RED },
    ],
  },
  {
    id: 'vwap',
    kind: 'vwap',
    pane: 'price',
    color: BLUE,
    inputs: [],
    plots: [{ key: 'vwap', color: BLUE, width: 2 }],
  },
];

/**
 * Indicators shown until a student picks their own (Cris, 2026-10-30: RSI on, EMAs off); after
 * that their choice is kept for their next sessions (`ChartSettingsService`).
 */
export const DEFAULT_INDICATORS = ['rsi14'];

/** Timeframes (bar seconds) of the "Visibility" tab, as the practice offers them. */
export const VISIBILITY_TIMEFRAMES = [
  { seconds: 60, label: '1m' },
  { seconds: 180, label: '3m' },
  { seconds: 300, label: '5m' },
  { seconds: 900, label: '15m' },
  { seconds: 3600, label: '1h' },
  { seconds: 14400, label: '4h' },
];

/** Line widths offered in the "Style" tab. */
export const LINE_WIDTHS = [1, 2, 3, 4];

export function findIndicator(id: string): Indicator | undefined {
  return INDICATORS.find((indicator) => indicator.id === id);
}

/** Whether `ids` only names known indicators, as a saved choice must. */
export function knownIndicators(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.every((id) => typeof id === 'string' && !!findIndicator(id));
}

/** An indicator as it comes, before the user changes anything. */
export function defaultConfig(indicator: Indicator): IndicatorConfig {
  return {
    inputs: Object.fromEntries(indicator.inputs.map((input) => [input.key, input.value])),
    colors: Object.fromEntries(indicator.plots.map((plot) => [plot.key, plot.color])),
    widths: Object.fromEntries(
      indicator.plots.filter((plot) => plot.width).map((plot) => [plot.key, plot.width!]),
    ),
    hidden: [],
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** A number of an input, rounded to its step and kept inside its bounds. */
export function clampInput(input: IndicatorInput, value: number): number {
  const step = input.step ?? 1;
  const rounded = Math.round(value / step) * step;
  const fixed = Number(rounded.toFixed(step < 1 ? 2 : 0));
  return Math.min(input.max ?? Infinity, Math.max(input.min ?? -Infinity, fixed));
}

/**
 * A saved (or edited) setup of `indicator`, made safe: every input, color and width it has,
 * the defaults where `saved` lacks one or has one that does not fit.
 */
export function readConfig(indicator: Indicator, saved: unknown): IndicatorConfig {
  const config = defaultConfig(indicator);
  if (!saved || typeof saved !== 'object') {
    return config;
  }
  const value = saved as Partial<Record<keyof IndicatorConfig, unknown>>;
  const record = (field: unknown) =>
    field && typeof field === 'object' ? (field as Record<string, unknown>) : {};
  const inputs = record(value.inputs);
  for (const input of indicator.inputs) {
    const given = inputs[input.key];
    if (input.type === 'bool' && typeof given === 'boolean') {
      config.inputs[input.key] = given;
    } else if (input.type === 'number' && typeof given === 'number' && Number.isFinite(given)) {
      config.inputs[input.key] = clampInput(input, given);
    }
  }
  const colors = record(value.colors);
  const widths = record(value.widths);
  for (const plot of indicator.plots) {
    const color = colors[plot.key];
    if (typeof color === 'string' && HEX.test(color)) {
      config.colors[plot.key] = color.toLowerCase();
    }
    const width = widths[plot.key];
    if (plot.width && typeof width === 'number' && LINE_WIDTHS.includes(width)) {
      config.widths[plot.key] = width;
    }
  }
  if (Array.isArray(value.hidden)) {
    config.hidden = VISIBILITY_TIMEFRAMES.map((t) => t.seconds).filter((s) =>
      (value.hidden as unknown[]).includes(s),
    );
  }
  return config;
}

/** The saved setups of known indicators, each made safe; unknown ids are dropped. */
export function readConfigs(saved: unknown): Record<string, IndicatorConfig> {
  if (!saved || typeof saved !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(saved as Record<string, unknown>)
      .map(([id, config]) => [id, findIndicator(id), config] as const)
      .filter(([, indicator]) => !!indicator)
      .map(([id, indicator, config]) => [id, readConfig(indicator!, config)]),
  );
}

/** Whether `config` is how `indicator` comes, so there is nothing to keep. */
export function isDefaultConfig(indicator: Indicator, config: IndicatorConfig): boolean {
  return JSON.stringify(config) === JSON.stringify(defaultConfig(indicator));
}

const num = (config: IndicatorConfig, key: string) => Number(config.inputs[key]);

/**
 * The indicator's short name with its settings, as TradingView labels it ("EMA 100",
 * "BB 20 2"); null for volume, whose name is translated.
 */
export function indicatorLabel(
  indicator: Indicator,
  config = defaultConfig(indicator),
): string | null {
  const values = indicator.inputs.filter((i) => i.type === 'number').map((i) => num(config, i.key));
  switch (indicator.kind) {
    case 'volume':
      return null;
    case 'rsi':
      // The smoothing is RSI's own line, not part of its name.
      return `RSI ${values[0]}`;
    default: {
      const short: Record<IndicatorKind, string> = {
        ema: 'EMA',
        rsi: 'RSI',
        volume: '',
        bollinger: 'BB',
        macd: 'MACD',
        stochastic: 'Stoch',
        atr: 'ATR',
        supertrend: 'SuperTrend',
        vwap: 'VWAP',
      };
      return [short[indicator.kind], ...values].join(' ');
    }
  }
}

/** A color with transparency, from `#rrggbb`; any other color is returned as is. */
export function fade(color: string, alpha = 0.5): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) {
    return color;
  }
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** RSI levels drawn as dotted guides in its pane (Cris's TradingView, 2026-10-30). */
export const RSI_LEVELS = [70, 60, 50, 40, 30];
/** Stochastic levels drawn as dotted guides in its pane (TradingView's). */
export const STOCHASTIC_LEVELS = [80, 50, 20];

/** Period of the RSI's smoothing average (SMA, as Cris has it in TradingView). */
export const RSI_SMOOTHING = 14;
/** Colors of the RSI's smoothing average and of its bullish and bearish divergences. */
export const RSI_COLORS = { smoothing: '#fdd835', bull: GREEN, bear: RED };
/** Overbought and oversold: the RSI above 70 is shaded red, below 30 green. */
export const RSI_OVERBOUGHT = 70;
export const RSI_OVERSOLD = 30;

const closes = (candles: Candle[]): IndicatorPoint[] =>
  candles.map((c) => ({ time: c.time, value: c.close }));

/** Exponential moving average of values, seeded with the SMA of the first `period`. */
export function emaOf(points: IndicatorPoint[], period: number): IndicatorPoint[] {
  if (points.length < period || period < 1) {
    return [];
  }
  const k = 2 / (period + 1);
  let value = points.slice(0, period).reduce((sum, p) => sum + p.value, 0) / period;
  const result = [{ time: points[period - 1].time, value }];
  for (const p of points.slice(period)) {
    value = p.value * k + value * (1 - k);
    result.push({ time: p.time, value });
  }
  return result;
}

/** Exponential moving average of the closes, seeded with the SMA of the first `period`. */
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  return emaOf(closes(candles), period);
}

/** Relative strength index with Wilder's smoothing, as TradingView computes it. */
export function rsi(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length <= period) {
    return [];
  }
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  const points = [{ time: candles[period].time, value: value() }];
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
    points.push({ time: candles[i].time, value: value() });
  }
  return points;
}

/** Volume of each candle (0 where it is unknown). */
export function volume(candles: Candle[]): IndicatorPoint[] {
  return candles.map((c) => ({ time: c.time, value: c.volume ?? 0 }));
}

/** Simple moving average of indicator values (the RSI's smoothing line). */
export function sma(points: IndicatorPoint[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let sum = 0;
  points.forEach((p, i) => {
    sum += p.value;
    if (i >= period) {
      sum -= points[i - period].value;
    }
    if (i >= period - 1) {
      result.push({ time: p.time, value: sum / period });
    }
  });
  return result;
}

/**
 * Bollinger Bands: the SMA of the closes and, `mult` standard deviations (of the population, as
 * TradingView's `ta.stdev`) above and below it, the bands.
 */
export function bollinger(
  candles: Candle[],
  period: number,
  mult: number,
): { basis: IndicatorPoint[]; upper: IndicatorPoint[]; lower: IndicatorPoint[] } {
  const basis = sma(closes(candles), period);
  const upper: IndicatorPoint[] = [];
  const lower: IndicatorPoint[] = [];
  basis.forEach((b, i) => {
    const window = candles.slice(i, i + period);
    const variance = window.reduce((sum, c) => sum + (c.close - b.value) ** 2, 0) / period;
    const dev = mult * Math.sqrt(variance);
    upper.push({ time: b.time, value: b.value + dev });
    lower.push({ time: b.time, value: b.value - dev });
  });
  return { basis, upper, lower };
}

/**
 * MACD: the fast EMA minus the slow one, its signal line (an EMA of it) and the histogram
 * between them, in TradingView's four shades: strong while it grows, faded while it shrinks.
 */
export function macd(
  candles: Candle[],
  fast: number,
  slow: number,
  signalPeriod: number,
  colors: { rising: string; falling: string } = { rising: '#26a69a', falling: '#ef5350' },
): { macd: IndicatorPoint[]; signal: IndicatorPoint[]; histogram: PlotPoint[] } {
  const fastLine = new Map(ema(candles, fast).map((p) => [p.time, p.value]));
  const line = ema(candles, slow)
    .filter((p) => fastLine.has(p.time))
    .map((p) => ({ time: p.time, value: fastLine.get(p.time)! - p.value }));
  const signal = emaOf(line, signalPeriod);
  const byTime = new Map(line.map((p) => [p.time, p.value]));
  let previous: number | null = null;
  const histogram = signal.map((s) => {
    const value = byTime.get(s.time)! - s.value;
    const growing = previous === null || Math.abs(value) >= Math.abs(previous);
    const color = value >= 0 ? colors.rising : colors.falling;
    previous = value;
    return { time: s.time, value, color: growing ? color : fade(color, 0.4) };
  });
  return { macd: line, signal, histogram };
}

/**
 * Stochastic: where the close sits in the range of the last `kPeriod` bars (0 to 100), its
 * %K (an SMA of `kSmoothing`) and %D (an SMA of %K). A flat range reads 50.
 */
export function stochastic(
  candles: Candle[],
  kPeriod: number,
  kSmoothing: number,
  dSmoothing: number,
): { k: IndicatorPoint[]; d: IndicatorPoint[] } {
  const raw: IndicatorPoint[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const window = candles.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...window.map((c) => c.high));
    const low = Math.min(...window.map((c) => c.low));
    const value = high === low ? 50 : (100 * (candles[i].close - low)) / (high - low);
    raw.push({ time: candles[i].time, value });
  }
  const k = sma(raw, kSmoothing);
  return { k, d: sma(k, dSmoothing) };
}

/** Average true range with Wilder's smoothing (`ta.atr`), the first true range being high - low. */
export function atr(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period || period < 1) {
    return [];
  }
  const ranges = candles.map((c, i) => {
    const close = candles[i - 1]?.close;
    return close === undefined
      ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - close), Math.abs(c.low - close));
  });
  let value = ranges.slice(0, period).reduce((sum, r) => sum + r, 0) / period;
  const points = [{ time: candles[period - 1].time, value }];
  for (let i = period; i < candles.length; i++) {
    value = (value * (period - 1) + ranges[i]) / period;
    points.push({ time: candles[i].time, value });
  }
  return points;
}

/** A SuperTrend flip: the trend turned up (buy) or down (sell) at this bar. */
export interface TrendSignal {
  time: number;
  kind: 'buy' | 'sell';
}

/**
 * SuperTrend exactly as TradingView's `ta.supertrend`: bands `factor` ATRs around the middle of
 * each bar that only tighten while the trend lasts. In an uptrend the line is the lower band
 * (`up`), in a downtrend the upper one (`down`); the other has a gap there. Each flip is a buy
 * or sell signal.
 */
export function supertrend(
  candles: Candle[],
  period: number,
  factor: number,
): { up: PlotPoint[]; down: PlotPoint[]; signals: TrendSignal[] } {
  const ranges = atr(candles, period);
  const first = candles.length - ranges.length;
  const up: PlotPoint[] = [];
  const down: PlotPoint[] = [];
  const signals: TrendSignal[] = [];
  let lower = 0;
  let upper = 0;
  let line = NaN;
  let direction = 1;
  ranges.forEach((range, j) => {
    const i = first + j;
    const c = candles[i];
    const middle = (c.high + c.low) / 2;
    const previousClose = candles[i - 1]?.close ?? 0;
    let newLower = middle - factor * range.value;
    let newUpper = middle + factor * range.value;
    newLower = newLower > lower || previousClose < lower ? newLower : lower;
    newUpper = newUpper < upper || previousClose > upper ? newUpper : upper;
    let next: number;
    if (j === 0) {
      next = 1;
    } else if (line === upper) {
      next = c.close > newUpper ? -1 : 1;
    } else {
      next = c.close < newLower ? 1 : -1;
    }
    if (j > 0 && next !== direction) {
      signals.push({ time: c.time, kind: next === -1 ? 'buy' : 'sell' });
    }
    direction = next;
    lower = newLower;
    upper = newUpper;
    line = direction === -1 ? lower : upper;
    up.push(direction === -1 ? { time: c.time, value: line } : { time: c.time });
    down.push(direction === 1 ? { time: c.time, value: line } : { time: c.time });
  });
  return { up, down, signals };
}

/**
 * Volume weighted average price of the day (UTC, as Binance's sessions): the average of each
 * bar's typical price (high + low + close) / 3 weighed by its volume, from the day's first bar.
 * Nothing while the day has no volume.
 */
export function vwap(candles: Candle[]): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  let day = NaN;
  let priceVolume = 0;
  let total = 0;
  for (const c of candles) {
    const today = Math.floor(c.time / 86_400);
    if (today !== day) {
      day = today;
      priceVolume = 0;
      total = 0;
    }
    const v = c.volume ?? 0;
    priceVolume += ((c.high + c.low + c.close) / 3) * v;
    total += v;
    if (total > 0) {
      points.push({ time: c.time, value: priceVolume / total });
    }
  }
  return points;
}

/** What an indicator draws: a list of points per plot, and SuperTrend's flips. */
export interface IndicatorResult {
  plots: Record<string, PlotPoint[]>;
  signals: TrendSignal[];
}

/** Computes `indicator` with `config` over the candles shown, so it never peeks ahead. */
export function computeIndicator(
  indicator: Indicator,
  candles: Candle[],
  config = defaultConfig(indicator),
): IndicatorResult {
  const n = (key: string) => num(config, key);
  const result = (plots: Record<string, PlotPoint[]>, signals: TrendSignal[] = []) => ({
    plots,
    signals,
  });
  switch (indicator.kind) {
    case 'ema':
      return result({ ema: ema(candles, n('length')) });
    case 'rsi': {
      const line = rsi(candles, n('length'));
      return result({ rsi: line, smoothing: sma(line, n('smoothing')) });
    }
    case 'volume':
      return result({ volume: volume(candles) });
    case 'bollinger':
      return result(bollinger(candles, n('length'), n('mult')));
    case 'macd': {
      const colors = { rising: config.colors['rising'], falling: config.colors['falling'] };
      const {
        macd: line,
        signal,
        histogram,
      } = macd(candles, n('fast'), n('slow'), n('signal'), colors);
      return result({ macd: line, signal, histogram });
    }
    case 'stochastic':
      return result(stochastic(candles, n('kLength'), n('kSmoothing'), n('dSmoothing')));
    case 'atr':
      return result({ atr: atr(candles, n('length')) });
    case 'supertrend': {
      const { up, down, signals } = supertrend(candles, n('atrLength'), n('factor'));
      return result({ up, down }, config.inputs['signals'] ? signals : []);
    }
    case 'vwap':
      return result({ vwap: vwap(candles) });
  }
}

/** A divergence between the price and the RSI, from one RSI pivot to the next. */
export interface Divergence {
  kind: 'bull' | 'bear';
  from: IndicatorPoint;
  to: IndicatorPoint;
}

/** Bars left and right of an RSI pivot, and the bars allowed between two pivots. */
export const PIVOT_BARS = 5;
const RANGE_MIN = 5;
const RANGE_MAX = 60;

/**
 * Regular divergences exactly as TradingView's built-in RSI "Calculate divergence" draws them
 * (lookback left and right 5, range 5 to 60): an RSI pivot low (below the 5 bars before it, not
 * above the 5 after it) higher than the previous RSI pivot low, while the low of the price at
 * that bar is lower than at the previous one, is bullish; pivot highs mirror it for bearish ones.
 * Only regular divergences, as TradingView, since hidden ones are mostly noise. TradingView's
 * range counts the bars since the bar before (`barssince(plFound[1])`), so pivots 6 to 61 bars
 * apart. A pivot is only known 5 bars later, so nothing peeks ahead.
 */
export function rsiDivergences(candles: Candle[], rsiPoints: IndicatorPoint[]): Divergence[] {
  const index = new Map(candles.map((c, i) => [c.time, i]));
  const values = rsiPoints.map((p) => p.value);
  const pivot = (i: number, low: boolean) => {
    if (i < PIVOT_BARS || i + PIVOT_BARS >= values.length) {
      return false;
    }
    for (let k = 1; k <= PIVOT_BARS; k++) {
      const left = values[i - k];
      const right = values[i + k];
      if (
        low ? !(values[i] < left && values[i] <= right) : !(values[i] > left && values[i] >= right)
      ) {
        return false;
      }
    }
    return true;
  };
  const result: Divergence[] = [];
  let lastLow: number | null = null;
  let lastHigh: number | null = null;
  for (let i = 0; i < values.length; i++) {
    for (const low of [true, false]) {
      if (!pivot(i, low)) {
        continue;
      }
      const previous = low ? lastLow : lastHigh;
      const bar = candles[index.get(rsiPoints[i].time)!];
      const apart = previous === null ? 0 : i - previous - 1;
      if (previous !== null && apart >= RANGE_MIN && apart <= RANGE_MAX) {
        const before = candles[index.get(rsiPoints[previous].time)!];
        const bull = low && values[i] > values[previous] && bar.low < before.low;
        const bear = !low && values[i] < values[previous] && bar.high > before.high;
        if (bull || bear) {
          result.push({
            kind: bull ? 'bull' : 'bear',
            from: rsiPoints[previous],
            to: rsiPoints[i],
          });
        }
      }
      if (low) {
        lastLow = i;
      } else {
        lastHigh = i;
      }
    }
  }
  return result;
}
