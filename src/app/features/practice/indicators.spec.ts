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
    // Price swing lows at bars 10 and 20 and swing highs at 30 and 40 (each the extreme of 5
    // bars each side); every bar 10 high otherwise, so prices within 2.5 count as equal. The RSI
    // turns at the given bars (within 2 of the swing) and sits at 50 elsewhere.
    const series = (prices: Record<number, number>, rsi: Record<number, number>) => {
      const candles: Candle[] = Array.from({ length: 50 }, (_, i) => {
        const low = i === 10 || i === 20 ? prices[i] : 95;
        const high = i === 30 || i === 40 ? prices[i] : 105;
        return { time: i * 60, open: 100, high: Math.max(high, low + 10), low, close: 100 };
      });
      return {
        candles,
        points: candles.map((c, i) => ({ time: c.time, value: rsi[i] ?? 50 })),
      };
    };
    const lows = (a: number, b: number, rsiA: number, rsiB: number, at = 20) =>
      series({ 10: a, 20: b, 30: 110, 40: 110 }, { 10: rsiA, [at]: rsiB });
    const highs = (a: number, b: number, rsiA: number, rsiB: number) =>
      series({ 10: 80, 20: 80, 30: a, 40: b }, { 30: rsiA, 40: rsiB });
    const found = ({ candles, points }: ReturnType<typeof series>) =>
      rsiDivergences(candles, points).map((d) => `${d.kind} ${d.strength}`);

    it('reads bullish ones at swing lows: strong, medium, weak and hidden', () => {
      // Lower price low, higher RSI low.
      expect(rsiDivergences(lows(90, 85, 20, 30).candles, lows(90, 85, 20, 30).points)).toEqual([
        {
          kind: 'bull',
          strength: 'strong',
          from: { time: 600, value: 20 },
          to: { time: 1200, value: 30 },
        },
      ]);
      // Equal price low, higher RSI low.
      expect(found(lows(90, 89, 20, 30))).toEqual(['bull medium']);
      // Lower price low, equal RSI low.
      expect(found(lows(90, 85, 20, 20.5))).toEqual(['bull weak']);
      // Higher price low, lower RSI low.
      expect(found(lows(85, 90, 30, 20))).toEqual(['bull hidden']);
    });

    it('reads bearish ones at swing highs: strong, medium, weak and hidden', () => {
      expect(found(highs(110, 115, 80, 70))).toEqual(['bear strong']);
      expect(found(highs(110, 111, 80, 70))).toEqual(['bear medium']);
      expect(found(highs(110, 115, 80, 79.5))).toEqual(['bear weak']);
      expect(found(highs(115, 110, 70, 80))).toEqual(['bear hidden']);
    });

    it("takes the RSI's own turn near the price swing", () => {
      const [d] = rsiDivergences(lows(90, 85, 20, 30, 22).candles, lows(90, 85, 20, 30, 22).points);
      expect(d.to).toEqual({ time: 22 * 60, value: 30 });
    });

    it('finds none when the RSI agrees with the price or the swing is not confirmed yet', () => {
      expect(found(lows(90, 85, 30, 20))).toEqual([]);
      expect(found(lows(90, 89, 20, 20))).toEqual([]);
      // Only 3 bars after the second low: it is not a swing yet.
      const early = lows(90, 85, 20, 30);
      expect(rsiDivergences(early.candles.slice(0, 24), early.points.slice(0, 24))).toEqual([]);
    });
  });
});
