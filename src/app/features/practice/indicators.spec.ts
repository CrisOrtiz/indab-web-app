import { Candle } from '../../core/models/practice';
import { INDICATORS, computeIndicator, ema, rsi } from './indicators';

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
    expect(INDICATORS.map((i) => i.label)).toEqual(['EMA 100', 'EMA 200', 'RSI 14']);
    expect(INDICATORS.map((i) => computeIndicator(i, data).length)).toEqual([151, 51, 236]);
  });
});
