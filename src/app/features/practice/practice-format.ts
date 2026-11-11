import { formatDate } from '@angular/common';

// Names of order types, sides and exit reasons are translated: see `trading` in
// core/i18n/messages.

/** Lots with two decimals, as brokers size gold orders: "0.05". */
export function formatLots(lots: number): string {
  return lots.toFixed(2);
}

/** Decimals that make sense for a price of this size. */
export function priceDecimals(price: number): number {
  // NASDAQ ~20000 and gold ~2000: cents; USD/JPY ~150: 3 decimals; EUR/USD ~1.08: 5.
  return price >= 1000 ? 2 : price >= 10 ? 3 : 5;
}

/** Rounds a price to `priceDecimals`. */
export function roundPrice(price: number): number {
  return Number(price.toFixed(priceDecimals(price)));
}

/** DecimalPipe format with `priceDecimals`. */
export function priceDigits(price: number): string {
  const decimals = priceDecimals(price);
  return `1.${decimals}-${decimals}`;
}

const SIGNED = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

/** Money with its sign, as trading platforms show P/L: "+1,250.00", "-3.10", "0.00". */
export function signedMoney(value: number): string {
  return SIGNED.format(value);
}

/** Remaining time as m:ss, or h:mm:ss from an hour up. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A replay start day range as `<input type="date">` takes it: "YYYY-MM-DD" bounds, in UTC. */
export interface DayRange {
  min: string;
  max: string;
}

/**
 * Whether a picked day is inside the range. iPad and iPhone date pickers ignore `min`/`max`,
 * so the page checks the day itself and says which days are allowed.
 */
export function inRange(day: string, range: DayRange): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= range.min && day <= range.max;
}

/** The range's first and last days written out in `language` ("3 ene 2026"). */
export function dayRange(range: DayRange, language: string): { from: string; to: string } {
  const day = (value: string) => formatDate(`${value}T00:00:00Z`, 'mediumDate', language, 'UTC');
  return { from: day(range.min), to: day(range.max) };
}
