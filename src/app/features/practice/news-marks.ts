import { NewsEvent, NewsImpact } from '../../core/models/market-news';

/** One icon on the time axis: the news of one bar, colored by the strongest impact. */
export interface NewsMark {
  /** The bar's index on the chart (past the last bar for news still to come). */
  key: number;
  x: number;
  impact: NewsImpact;
  /** Whether every release of the bar is out (the replay passed it). */
  released: boolean;
  events: { event: NewsEvent; released: boolean }[];
}

const RANK: Record<NewsImpact, number> = { high: 3, medium: 2, low: 1 };

/** Index of the last bar starting at or before `time` (times are sorted). */
function barAt(times: readonly number[], time: number): number {
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (times[mid] <= time) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

/**
 * The news icons on screen, one per bar. A release goes on the bar it falls in; one still to
 * come goes where its bar will be (bars past the last one, counted at `barSeconds`), so the
 * student sees it coming as in TradingView. `toX` turns a bar index into a pixel (null off the
 * chart); icons outside 0..`width` are left out. A release counts as out once the last bar
 * shown has started at or after it.
 */
export function newsMarks(
  events: readonly NewsEvent[],
  times: readonly number[],
  barSeconds: number,
  toX: (index: number) => number | null,
  width: number,
): NewsMark[] {
  if (!times.length || !events.length) {
    return [];
  }
  const last = times.length - 1;
  const bar = barSeconds > 0 ? barSeconds : times.length > 1 ? times[last] - times[last - 1] : 60;
  const marks = new Map<number, NewsMark>();
  for (const event of events) {
    if (event.time < times[0]) {
      continue;
    }
    const released = event.time <= times[last];
    const key =
      event.time < times[last] + bar
        ? barAt(times, event.time)
        : last + Math.floor((event.time - times[last]) / bar);
    const x = toX(key);
    if (x === null || x < 0 || x > width) {
      continue;
    }
    const mark = marks.get(key);
    if (!mark) {
      marks.set(key, { key, x, impact: event.impact, released, events: [{ event, released }] });
      continue;
    }
    mark.events.push({ event, released });
    mark.released &&= released;
    if (RANK[event.impact] > RANK[mark.impact]) {
      mark.impact = event.impact;
    }
  }
  for (const mark of marks.values()) {
    mark.events.sort(
      (a, b) =>
        RANK[b.event.impact] - RANK[a.event.impact] ||
        a.event.time - b.event.time ||
        a.event.name.localeCompare(b.event.name),
    );
  }
  return [...marks.values()].sort((a, b) => a.key - b.key);
}
