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

/** How a divergence reads, from the classic summary (strong, medium, weak and hidden). */
export type DivergenceStrength = 'strong' | 'medium' | 'weak' | 'hidden';
export const DIVERGENCE_STRENGTHS: readonly DivergenceStrength[] = [
  'strong',
  'medium',
  'weak',
  'hidden',
];

/** A divergence between the price and the RSI, from one swing to the next, on the RSI. */
export interface Divergence {
  kind: 'bull' | 'bear';
  strength: DivergenceStrength;
  from: IndicatorPoint;
  to: IndicatorPoint;
}

/** Bars each side of a price swing, and the bars allowed between two swings. */
export const PIVOT_BARS = 5;
const RANGE_MIN = 5;
const RANGE_MAX = 60;
/** Bars each side of a price swing searched for the RSI's own turn. */
const RSI_WINDOW = 2;
/** Two swings are "equal" within this share of the average bar range, or these RSI points. */
const EQUAL_RANGE = 0.25;
const EQUAL_RSI = 1;

/**
 * Divergences between the price swings and the RSI, as in the classic summary Cris shared:
 * at two consecutive swing lows (lowest low of 5 bars each side, 5 to 60 bars apart), a lower
 * price low with a higher RSI low is a strong bullish one, an equal price low with a higher RSI
 * low a medium one, a lower price low with an equal RSI low a weak one, and a higher price low
 * with a lower RSI low a hidden one. Swing highs mirror it for bearish ones. The RSI is read at
 * its own turn within 2 bars of the price swing. A swing is only known 5 bars later, so nothing
 * peeks ahead.
 */
export function rsiDivergences(candles: Candle[], rsiPoints: IndicatorPoint[]): Divergence[] {
  const rsiIndex = new Map(rsiPoints.map((p, i) => [p.time, i]));
  const swing = (i: number, low: boolean) => {
    if (i < PIVOT_BARS || i + PIVOT_BARS >= candles.length) {
      return false;
    }
    const at = low ? candles[i].low : candles[i].high;
    for (let k = 1; k <= PIVOT_BARS; k++) {
      const left = low ? candles[i - k].low : candles[i - k].high;
      const right = low ? candles[i + k].low : candles[i + k].high;
      if (low ? !(at < left && at <= right) : !(at > left && at >= right)) {
        return false;
      }
    }
    return true;
  };
  // The RSI's lowest (or highest) point near the swing, where its own line turns.
  const rsiTurn = (i: number, low: boolean): IndicatorPoint | null => {
    let best: IndicatorPoint | null = null;
    for (let k = i - RSI_WINDOW; k <= i + RSI_WINDOW; k++) {
      const at = k >= 0 && k < candles.length ? rsiIndex.get(candles[k].time) : undefined;
      const point = at === undefined ? undefined : rsiPoints[at];
      if (point && (!best || (low ? point.value < best.value : point.value > best.value))) {
        best = point;
      }
    }
    return best;
  };
  // Average bar range over the 14 bars up to a swing: how close two prices count as equal.
  const tolerance = (i: number) => {
    const bars = candles.slice(Math.max(0, i - 13), i + 1);
    return (bars.reduce((sum, c) => sum + c.high - c.low, 0) / bars.length) * EQUAL_RANGE;
  };
  const compare = (diff: number, equal: number) => (diff > equal ? 1 : diff < -equal ? -1 : 0);
  const result: Divergence[] = [];
  const last: Record<'low' | 'high', { bar: number; rsi: IndicatorPoint } | null> = {
    low: null,
    high: null,
  };
  for (let i = 0; i < candles.length; i++) {
    for (const low of [true, false]) {
      const rsi = swing(i, low) ? rsiTurn(i, low) : null;
      if (!rsi) {
        continue;
      }
      const previous = last[low ? 'low' : 'high'];
      if (previous && i - previous.bar >= RANGE_MIN && i - previous.bar <= RANGE_MAX) {
        const price = low
          ? compare(candles[i].low - candles[previous.bar].low, tolerance(i))
          : compare(candles[i].high - candles[previous.bar].high, tolerance(i));
        const osc = compare(rsi.value - previous.rsi.value, EQUAL_RSI);
        // Read bearish swings upside down so both kinds share one table.
        const p = low ? price : -price;
        const r = low ? osc : -osc;
        const strength: DivergenceStrength | null =
          p < 0 && r > 0
            ? 'strong'
            : p === 0 && r > 0
              ? 'medium'
              : p < 0 && r === 0
                ? 'weak'
                : p > 0 && r < 0
                  ? 'hidden'
                  : null;
        if (strength && previous.rsi.time < rsi.time) {
          result.push({ kind: low ? 'bull' : 'bear', strength, from: previous.rsi, to: rsi });
        }
      }
      last[low ? 'low' : 'high'] = { bar: i, rsi };
    }
  }
  return result;
}
