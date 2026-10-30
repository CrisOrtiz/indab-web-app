import { Candle } from '../../core/models/practice';

/** One value of an indicator, at a candle's time (seconds). */
export interface IndicatorPoint {
  time: number;
  value: number;
}

export type IndicatorKind = 'ema' | 'rsi' | 'volume';

export interface Indicator {
  id: string;
  label: string;
  kind: IndicatorKind;
  period: number;
  color: string;
}

/**
 * The indicators students can switch on, as in TradingView's favourites bar. Cris trades with
 * the EMA 100 and 200 only (2026-10-26), so those are the moving averages. Volume is drawn as
 * bars at the foot of the candles; its label is translated (`chart.volume`).
 */
export const INDICATORS: Indicator[] = [
  { id: 'ema100', label: 'EMA 100', kind: 'ema', period: 100, color: '#ff9800' },
  { id: 'ema200', label: 'EMA 200', kind: 'ema', period: 200, color: '#2962ff' },
  { id: 'rsi14', label: 'RSI 14', kind: 'rsi', period: 14, color: '#7e57c2' },
  { id: 'volume', label: 'Volume', kind: 'volume', period: 0, color: '#787b86' },
];

/**
 * Indicators shown until a student picks their own (Cris, 2026-10-30: RSI on, EMAs off); after
 * that their choice is kept for their next sessions (`ChartSettingsService`).
 */
export const DEFAULT_INDICATORS = ['rsi14'];

/** Whether `ids` only names known indicators, as a saved choice must. */
export function knownIndicators(ids: unknown): ids is string[] {
  return (
    Array.isArray(ids) && ids.every((id) => INDICATORS.some((indicator) => indicator.id === id))
  );
}

/** RSI levels drawn as dotted guides in its pane (Cris's TradingView, 2026-10-30). */
export const RSI_LEVELS = [70, 60, 50, 40, 30];

/** Period of the RSI's smoothing average (SMA, as Cris has it in TradingView). */
export const RSI_SMOOTHING = 14;
/** Colors of the RSI's smoothing average and of its bullish and bearish divergences. */
export const RSI_COLORS = { smoothing: '#fdd835', bull: '#089981', bear: '#f23645' };
/** Overbought and oversold: the RSI above 70 is shaded red, below 30 green. */
export const RSI_OVERBOUGHT = 70;
export const RSI_OVERSOLD = 30;

/** Exponential moving average of the closes, seeded with the SMA of the first `period`. */
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) {
    return [];
  }
  const k = 2 / (period + 1);
  let value = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  const points = [{ time: candles[period - 1].time, value }];
  for (const c of candles.slice(period)) {
    value = c.close * k + value * (1 - k);
    points.push({ time: c.time, value });
  }
  return points;
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

export function computeIndicator(indicator: Indicator, candles: Candle[]): IndicatorPoint[] {
  const compute = { ema, rsi, volume: (list: Candle[]) => volume(list) }[indicator.kind];
  return compute(candles, indicator.period);
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
