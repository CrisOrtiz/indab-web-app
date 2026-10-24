const HOUR = 3_600_000;

/** Start (ms, UTC) of US daylight saving time in `year`: second Sunday of March, 2:00 local. */
function dstStart(year: number): number {
  const march1 = new Date(Date.UTC(year, 2, 1)).getUTCDay();
  const day = 1 + ((7 - march1) % 7) + 7;
  return Date.UTC(year, 2, day, 7);
}

/** End (ms, UTC) of US daylight saving time in `year`: first Sunday of November, 2:00 local. */
function dstEnd(year: number): number {
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const day = 1 + ((7 - nov1) % 7);
  return Date.UTC(year, 10, day, 6);
}

/** New York's offset from UTC (hours) at `time` (ms): -4 in summer, -5 in winter. */
export function newYorkOffset(time: number): number {
  const year = new Date(time).getUTCFullYear();
  return time >= dstStart(year) && time < dstEnd(year) ? -4 : -5;
}

/**
 * Whether spot gold (XAU/USD) is closed at `time` (ms), as brokers and TradingView show it:
 * from Friday 17:00 to Sunday 18:00 New York time, and the daily break from 17:00 to 18:00.
 * Crypto venues keep trading then, on a frozen or thin price, so those bars are dropped.
 */
export function goldClosed(time: number): boolean {
  const local = new Date(time + newYorkOffset(time) * HOUR);
  const day = local.getUTCDay();
  const hour = local.getUTCHours();
  return hour === 17 || day === 6 || (day === 5 && hour > 17) || (day === 0 && hour < 18);
}

/** The first time at or after `time` (ms) when gold is open, in steps of `step` ms. */
export function nextGoldOpen(time: number, step: number): number {
  let t = time;
  // A weekend is at most 49 hours long.
  for (let i = 0; i < (60 * HOUR) / step && goldClosed(t); i++) {
    t += step;
  }
  return t;
}
