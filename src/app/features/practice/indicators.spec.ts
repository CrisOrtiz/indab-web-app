import { Candle } from '../../core/models/practice';
import {
  INDICATORS,
  computeIndicator,
  ema,
  knownIndicators,
  rsi,
  rsiDivergences,
  sma,
  volume,
} from './indicators';

const closes = (...values: number[]): Candle[] =>
  values.map((close, i) => ({ time: i + 1, open: close, high: close, low: close, close }));

describe('indicators', () => {
  it('seeds the EMA with the SMA and then weighs recent closes more', () => {
    // k = 2 / (3 + 1) = 0.5.
    expect(ema(closes(1, 2, 3, 5), 3)).toEqual([
      { time: 3, value: 2 },
      { time: 4, value: 3.5 },
    ]);
    expect(ema(closes(1), 3)).toEqual([]);
  });

  it("computes the RSI with Wilder's smoothing", () => {
    expect(rsi(closes(1, 2, 3, 4), 3)).toEqual([{ time: 4, value: 100 }]);
    // Gains 1, 1 and a loss of 1: 2/3 average gain, 1/3 average loss, RS 2.
    const [first, next] = rsi(closes(1, 2, 3, 2, 2), 3);
    expect(first.value).toBeCloseTo(66.667, 3);
    // Flat candle: gain 4/9, loss 2/9, RS still 2.
    expect(next.value).toBeCloseTo(66.667, 3);
    expect(rsi(closes(1, 2, 3), 3)).toEqual([]);
  });

  it('computes each indicator of the toolbar by its kind', () => {
    const data = closes(...Array.from({ length: 250 }, (_, i) => 100 + i));
    expect(INDICATORS.map((i) => i.label)).toEqual(['EMA 100', 'EMA 200', 'RSI 14', 'Volume']);
    expect(INDICATORS.map((i) => computeIndicator(i, data).length)).toEqual([151, 51, 236, 250]);
  });

  it('reads the volume of each candle, 0 where it is unknown', () => {
    expect(volume([{ ...closes(1)[0], volume: 12 }, closes(2)[0]])).toEqual([
      { time: 1, value: 12 },
      { time: 1, value: 0 },
    ]);
  });

  it('accepts only known indicator ids as a saved choice', () => {
    expect(knownIndicators(['ema100', 'volume'])).toBe(true);
    expect(knownIndicators([])).toBe(true);
    expect(knownIndicators(['macd'])).toBe(false);
    expect(knownIndicators('rsi14')).toBe(false);
    expect(knownIndicators(undefined)).toBe(false);
  });

  it('averages indicator values', () => {
    const points = [1, 2, 3, 4].map((value, time) => ({ time, value }));
    expect(sma(points, 3)).toEqual([
      { time: 2, value: 2 },
      { time: 3, value: 3 },
    ]);
  });

  describe('rsiDivergences', () => {
    // A V in the RSI at bars 6 and 16 (lowest within 5 bars each side), and a peak at 26.
    const rsiAt = (i: number) =>
      i === 6 ? 20 : i === 16 ? 30 : i === 26 ? 80 : i === 36 ? 70 : 50;
    const series = (lows: Record<number, number>, highs: Record<number, number>) => {
      const candles: Candle[] = Array.from({ length: 45 }, (_, i) => ({
        time: i * 60,
        open: 100,
        high: highs[i] ?? 105,
        low: lows[i] ?? 95,
        close: 100,
      }));
      return {
        candles,
        points: candles.map((c, i) => ({ time: c.time, value: rsiAt(i) })),
      };
    };

    it('finds a bullish one where the price makes a lower low and the RSI a higher one', () => {
      const { candles, points } = series({ 6: 90, 16: 85 }, {});
      expect(rsiDivergences(candles, points)).toEqual([
        { kind: 'bull', from: { time: 360, value: 20 }, to: { time: 960, value: 30 } },
      ]);
    });

    it('finds a bearish one where the price makes a higher high and the RSI a lower one', () => {
      const { candles, points } = series({}, { 26: 110, 36: 115 });
      expect(rsiDivergences(candles, points)).toEqual([
        { kind: 'bear', from: { time: 1560, value: 80 }, to: { time: 2160, value: 70 } },
      ]);
    });

    it('finds none when the price agrees with the RSI or the pivot is not confirmed yet', () => {
      const { candles, points } = series({ 6: 85, 16: 90 }, {});
      expect(rsiDivergences(candles, points)).toEqual([]);
      // Only 3 bars after the second low: it is not a pivot yet.
      const early = series({ 6: 90, 16: 85 }, {});
      expect(rsiDivergences(early.candles.slice(0, 20), early.points.slice(0, 20))).toEqual([]);
    });
  });
});
