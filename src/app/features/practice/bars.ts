import { Candle } from '../../core/models/practice';

/**
 * Builds bars of one timeframe from one-minute candles as the replay moves forward. It only
 * folds in the new minutes on each call, and a completed bar keeps its identity, so the chart
 * can update just the last bar instead of redrawing.
 */
export class BarBuilder {
  private readonly bars: Candle[] = [];
  /** Index of the next minute to fold in. */
  private next: number;

  /** `from`: index of the first minute that belongs to the replay. */
  constructor(
    readonly seconds: number,
    private readonly from: number,
  ) {
    this.next = from;
  }

  /** The bars made of `minutes[from..to]`. Returns a new array each time. */
  build(minutes: Candle[], to: number): Candle[] {
    if (to < this.next - 1) {
      this.bars.length = 0;
      this.next = this.from;
    }
    for (; this.next <= to; this.next++) {
      const m = minutes[this.next];
      const time = Math.floor(m.time / this.seconds) * this.seconds;
      const last = this.bars.at(-1);
      if (last?.time === time) {
        this.bars[this.bars.length - 1] = {
          time,
          open: last.open,
          high: Math.max(last.high, m.high),
          low: Math.min(last.low, m.low),
          close: m.close,
        };
      } else {
        this.bars.push({ time, open: m.open, high: m.high, low: m.low, close: m.close });
      }
    }
    return [...this.bars];
  }
}

/** Time of the last minute of the bar after the one `minuteTime` falls in. */
export function nextBarEnd(minuteTime: number, seconds: number): number {
  return (Math.floor((minuteTime + 60) / seconds) + 1) * seconds - 60;
}

/** "2 d 4 h 15 min": market time elapsed in the replay. */
export function formatElapsed(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d} d`, h && `${h} h`, `${m} min`].filter(Boolean).join(' ');
}
