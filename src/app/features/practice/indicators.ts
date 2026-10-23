import { Candle } from '../../core/models/practice';

/** One value of an indicator, at a candle's time (seconds). */
export interface IndicatorPoint {
  time: number;
  value: number;
}

export type IndicatorKind = 'sma' | 'ema' | 'rsi';

export interface Indicator {
  id: string;
  label: string;
  kind: IndicatorKind;
  period: number;
  color: string;
}

/** The indicators students can switch on, as in TradingView's favourites bar. */
export const INDICATORS: Indicator[] = [
  { id: 'sma20', label: 'MA 20', kind: 'sma', period: 20, color: '#2962ff' },
  { id: 'sma50', label: 'MA 50', kind: 'sma', period: 50, color: '#ff9800' },
  { id: 'ema21', label: 'EMA 21', kind: 'ema', period: 21, color: '#9c27b0' },
  { id: 'rsi14', label: 'RSI 14', kind: 'rsi', period: 14, color: '#7e57c2' },
];

/** RSI levels drawn as guides in its pane. */
export const RSI_LEVELS = [70, 30];

/** Simple moving average of the closes; starts once `period` candles exist. */
export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  let sum = 0;
  candles.forEach((c, i) => {
    sum += c.close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      points.push({ time: c.time, value: sum / period });
    }
  });
  return points;
}

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

export function computeIndicator(indicator: Indicator, candles: Candle[]): IndicatorPoint[] {
  const compute = { sma, ema, rsi }[indicator.kind];
  return compute(candles, indicator.period);
}
