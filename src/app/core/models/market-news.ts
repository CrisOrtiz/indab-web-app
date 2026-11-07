// Economic news shown on the practice chart. This file has no imports so the daily sync script
// (`scripts/sync-news.mts`, run by Node with its types stripped) can use the same code.

/** Impact as Finance Calendar rates it: red, orange and yellow on the chart. */
export type NewsImpact = 'high' | 'medium' | 'low';

/** One release (a figure or a central-bank decision), as stored in `marketNews/{month}`. */
export interface NewsEvent {
  /** Finance Calendar's id of the release. */
  id: string;
  /** Release time, seconds since 1970 (UTC), like the candles. */
  time: number;
  name: string;
  /** ISO alpha-2 code, e.g. 'US'. */
  country: string;
  impact: NewsImpact;
  /** The period the figure is about, e.g. 'October 2026'. */
  period: string | null;
  actual: string | null;
  prior: string | null;
  consensus: string | null;
  unit: string | null;
  /** The publisher (e.g. 'U.S. Bureau of Labor Statistics'), credited with the figures. */
  source: string | null;
}

/**
 * Stored at `marketNews/{YYYY-MM}` (UTC month) by the daily GitHub Actions job: every release
 * of that month the chart shows. Data from financecalendar.com, which allows storing and
 * showing it with a visible link to it (the chart has one).
 */
export interface MarketNewsMonth {
  month: string;
  events: NewsEvent[];
}

/** Countries whose news is kept: the US moves gold (and USD/JPY and the NASDAQ, for later). */
export const NEWS_COUNTRIES = ['US'];

/** Impacts kept: low-impact releases would only crowd the chart. */
export const NEWS_IMPACTS: readonly NewsImpact[] = ['high', 'medium'];

/** Where the figures come from, linked next to them as Finance Calendar's terms ask. */
export const NEWS_SOURCE_URL = 'https://www.financecalendar.com';

/** The `YYYY-MM` (UTC) a time in seconds falls in, which names its `marketNews` document. */
export function monthKey(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 7);
}

/** Month keys from the one of `from` to the one of `to` (seconds), both included. */
export function monthsBetween(from: number, to: number): string[] {
  const months: string[] = [];
  const day = new Date(from * 1000);
  let year = day.getUTCFullYear();
  let month = day.getUTCMonth();
  const last = monthKey(to);
  for (let guard = 0; guard < 600; guard++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (key > last) {
      break;
    }
    months.push(key);
    month++;
    if (month === 12) {
      month = 0;
      year++;
    }
  }
  return months;
}

/** First and last day (`YYYY-MM-DD`) of a month key, as Finance Calendar's `from`/`to`. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, '0')}` };
}

function text(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;
}

/**
 * A Finance Calendar event as the chart keeps it, or null when it is not shown: another
 * country or impact, a holiday or other category, a cancelled release, or no exact time.
 */
export function toNewsEvent(raw: Record<string, unknown>): NewsEvent | null {
  const impact = raw['impact'];
  const country = typeof raw['country'] === 'string' ? raw['country'].toUpperCase() : '';
  const at = typeof raw['release_at_utc'] === 'string' ? Date.parse(raw['release_at_utc']) : NaN;
  const name = text(raw['title']) ?? text(raw['name']) ?? text(raw['series_name']);
  const category = raw['category'];
  if (
    !NEWS_IMPACTS.includes(impact as NewsImpact) ||
    !NEWS_COUNTRIES.includes(country) ||
    !Number.isFinite(at) ||
    !name ||
    raw['status'] === 'cancelled' ||
    raw['all_day'] === true ||
    category === 'market-holidays' ||
    category === 'crypto'
  ) {
    return null;
  }
  return {
    id: text(raw['id']) ?? `${country}-${at}-${name}`,
    time: Math.floor(at / 1000),
    name,
    country,
    impact: impact as NewsImpact,
    period: text(raw['period']),
    actual: text(raw['actual']),
    prior: text(raw['prior']),
    consensus: text(raw['consensus']),
    unit: text(raw['unit']),
    source: text(raw['source_name']),
  };
}

/** A figure with its unit, as the chart prints it: '4.1%', '254 K'. */
export function formatFigure(value: string | null, unit: string | null): string | null {
  if (value === null) {
    return null;
  }
  const number = Number(value);
  const shown = Number.isFinite(number)
    ? number.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : value;
  if (!unit) {
    return shown;
  }
  return unit === '%' ? `${shown}%` : unit.length <= 12 ? `${shown} ${unit}` : shown;
}
