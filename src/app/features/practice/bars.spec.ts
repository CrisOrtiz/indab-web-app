import { Candle } from '../../core/models/practice';
import { BarBuilder, formatElapsed, nextBarEnd } from './bars';

const minute = (i: number, close: number): Candle => ({
  time: 6000 + i * 60,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
});

describe('BarBuilder', () => {
  // Minute 0 is history; the replay's minutes start at 6000 s, on a 5-minute boundary.
  const minutes = [minute(-1, 99), ...Array.from({ length: 12 }, (_, i) => minute(i, 100 + i))];

  it('folds minutes into bars, keeping completed bars and growing the last one', () => {
    const builder = new BarBuilder(300, 1);
    const first = builder.build(minutes, 3);
    expect(first).toEqual([{ time: 6000, open: 99, high: 103, low: 98, close: 102 }]);

    const second = builder.build(minutes, 7);
    expect(second).toEqual([
      { time: 6000, open: 99, high: 105, low: 98, close: 104 },
      { time: 6300, open: 104, high: 107, low: 103, close: 106 },
    ]);
    // A completed bar is the same object on the next call.
    expect(builder.build(minutes, 8)[0]).toBe(second[0]);
  });

  it('starts over if asked for fewer minutes than it has', () => {
    const builder = new BarBuilder(60, 1);
    builder.build(minutes, 5);
    expect(builder.build(minutes, 2)).toHaveLength(2);
  });
});

describe('nextBarEnd', () => {
  it('is the last minute of the next bar', () => {
    // From the history minute before 900 s, the first 15-minute bar ends at 1740 s.
    expect(nextBarEnd(840, 900)).toBe(1740);
    expect(nextBarEnd(1740, 900)).toBe(2640);
    // Mid-bar (after switching to a longer timeframe), it completes the current bar.
    expect(nextBarEnd(1000, 900)).toBe(1740);
  });
});

describe('formatElapsed', () => {
  it('shows days, hours and minutes of market time', () => {
    expect(formatElapsed(0)).toBe('0 min');
    expect(formatElapsed(15 * 60)).toBe('15 min');
    expect(formatElapsed(26 * 3600 + 60)).toBe('1 d 2 h 1 min');
  });
});
