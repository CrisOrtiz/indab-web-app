import { Candle } from '../../core/models/practice';
import {
  INDICATORS,
  atr,
  bollinger,
  clampInput,
  computeIndicator,
  defaultConfig,
  ema,
  findIndicator,
  indicatorLabel,
  isDefaultConfig,
  knownIndicators,
  macd,
  readConfig,
  rsi,
  rsiDivergences,
  sma,
  stochastic,
  supertrend,
  volume,
  vwap,
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
    expect(INDICATORS.map((i) => indicatorLabel(i))).toEqual([
      'EMA 100',
      'EMA 200',
      'RSI 14',
      null,
      'BB 20 2',
      'MACD 12 26 9',
      'Stoch 14 1 3',
      'ATR 14',
      'SuperTrend 10 3',
      'VWAP',
    ]);
    const first = (id: string) => {
      const indicator = findIndicator(id)!;
      return computeIndicator(indicator, data).plots[indicator.plots[0]?.key ?? 'volume'].length;
    };
    expect(INDICATORS.map((i) => first(i.id))).toEqual([
      151, 51, 236, 250, 231, 225, 237, 237, 241, 0,
    ]);
    // Their settings change what they compute.
    const ema100 = findIndicator('ema100')!;
    const fifty = readConfig(ema100, { inputs: { length: 50 } });
    expect(computeIndicator(ema100, data, fifty).plots['ema']).toHaveLength(201);
    expect(indicatorLabel(ema100, fifty)).toBe('EMA 50');
  });

  it('draws Bollinger Bands two population deviations around the SMA', () => {
    const { basis, upper, lower } = bollinger(closes(1, 2, 3, 4), 3, 2);
    expect(basis).toEqual([
      { time: 3, value: 2 },
      { time: 4, value: 3 },
    ]);
    // Variance (1 + 0 + 1) / 3.
    const dev = 2 * Math.sqrt(2 / 3);
    expect(upper[0].value).toBeCloseTo(2 + dev, 10);
    expect(lower[1].value).toBeCloseTo(3 - dev, 10);
  });

  it('computes the MACD, its signal and a histogram shaded by whether it grows', () => {
    // A steady rise: EMAs lag by (length - 1) / 2 bars, so the MACD of 3 and 5 is 1.
    const result = macd(closes(...Array.from({ length: 12 }, (_, i) => i + 1)), 3, 5, 2);
    expect(result.macd[0]).toEqual({ time: 5, value: 1 });
    expect(result.macd.every((p) => Math.abs(p.value - 1) < 1e-9)).toBe(true);
    expect(result.signal[0].time).toBe(6);
    expect(result.histogram.every((p) => Math.abs(p.value!) < 1e-9)).toBe(true);
    // A drop after it: the histogram goes negative, red, and fades once it shrinks.
    const turn = macd(closes(1, 2, 3, 4, 5, 6, 7, 8, 4, 3, 3, 3, 3, 3), 3, 5, 2);
    const colors = turn.histogram.map((p) => (p.value! < 0 ? p.color : null)).filter(Boolean);
    expect(colors[0]).toBe('#ef5350');
    expect(colors).toContain('rgba(239, 83, 80, 0.4)');
  });

  it('places the close in the range of the last bars for the stochastic', () => {
    const { k, d } = stochastic(closes(1, 2, 3, 2), 3, 1, 1);
    expect(k).toEqual([
      { time: 3, value: 100 },
      { time: 4, value: 0 },
    ]);
    expect(d).toEqual(k);
    // A flat range reads 50.
    expect(stochastic(closes(5, 5, 5), 3, 1, 1).k).toEqual([{ time: 3, value: 50 }]);
  });

  it("averages the true range with Wilder's smoothing", () => {
    // True ranges 0, 2, 3, 4: the first average is 1, then (1 + 3) / 2 and (2 + 4) / 2.
    expect(atr(closes(1, 3, 6, 10), 2)).toEqual([
      { time: 2, value: 1 },
      { time: 3, value: 2 },
      { time: 4, value: 3 },
    ]);
  });

  it('follows the trend with SuperTrend and signals each flip', () => {
    const prices = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i),
      ...Array.from({ length: 30 }, (_, i) => 71 + 2 * i),
      ...Array.from({ length: 30 }, (_, i) => 129 - 3 * i),
    ];
    const candles = prices.map((close, i) => ({
      time: i + 1,
      open: close,
      high: close + 0.5,
      low: close - 0.5,
      close,
    }));
    const { up, down, signals } = supertrend(candles, 5, 2);
    expect(up).toHaveLength(86);
    // Each bar has one line: below the price going up, above it going down.
    up.forEach((p, i) =>
      expect((p.value === undefined) !== (down[i].value === undefined)).toBe(true),
    );
    up.filter((p) => p.value !== undefined).forEach((p) =>
      expect(p.value!).toBeLessThan(candles[p.time - 1].close),
    );
    expect(signals.map((s) => s.kind)).toEqual(['buy', 'sell']);
    expect(signals[0].time).toBeGreaterThan(31);
    expect(signals[1].time).toBeGreaterThan(61);
    // The buy flips the line from above to below.
    const at = signals[0].time - 5;
    expect(down[at - 1].value).toBeDefined();
    expect(up[at].value).toBeDefined();
  });

  it('weighs typical prices by volume for the VWAP, from each day', () => {
    const day = 86_400;
    const bar = (time: number, price: number, v: number) => ({
      time,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: v,
    });
    expect(vwap([bar(0, 10, 1), bar(60, 20, 3), bar(day, 40, 2), bar(day + 60, 50, 0)])).toEqual([
      { time: 0, value: 10 },
      { time: 60, value: 17.5 },
      { time: day, value: 40 },
      { time: day + 60, value: 40 },
    ]);
    expect(vwap([bar(0, 10, 0)])).toEqual([]);
  });

  it("reads a saved setup safely: what doesn't fit takes the default", () => {
    const st = findIndicator('supertrend')!;
    expect(
      readConfig(st, {
        inputs: { atrLength: 7.4, factor: 2.345, signals: false, extra: 1 },
        colors: { up: '#00FF00', down: 'red' },
        widths: { up: 3, down: 9 },
        hidden: [60, 61, 'x'],
      }),
    ).toEqual({
      inputs: { atrLength: 7, factor: 2.3, signals: false },
      colors: { up: '#00ff00', down: '#f23645' },
      widths: { up: 3 },
      hidden: [60],
    });
    expect(readConfig(st, 'nope')).toEqual(defaultConfig(st));
    expect(isDefaultConfig(st, readConfig(st, {}))).toBe(true);
    expect(clampInput(st.inputs[0], 0)).toBe(1);
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
    expect(knownIndicators(['macd', 'supertrend'])).toBe(true);
    expect(knownIndicators(['ichimoku'])).toBe(false);
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

    it('needs the pivots 6 to 61 bars apart, as TradingView counts its range', () => {
      // Pivots at bars 6 and 11: only 4 bars between them.
      const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
        time: i * 60,
        open: 100,
        high: 105,
        low: i === 6 ? 90 : i === 11 ? 85 : 95,
        close: 100,
      }));
      const points = candles.map((c, i) => ({
        time: c.time,
        value: i === 6 ? 20 : i === 11 ? 30 : 50,
      }));
      expect(rsiDivergences(candles, points)).toEqual([]);
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
