const MINUTE = 60_000;

/**
 * How many one-minute candles an evaluation attempt run by the clock shows `elapsed` ms after
 * it started: `pace` market minutes per real minute, never past its time limit.
 */
export function liveMinutes(elapsed: number, pace: number, durationMinutes: number): number {
  const shown = Math.floor((Math.max(0, elapsed) * pace) / MINUTE);
  return Math.min(shown, durationMinutes * pace);
}

/** Seconds of market an evaluation at `pace` covers, for `formatElapsed`. */
export function marketCovered(pace: number, durationMinutes: number): number {
  return pace * durationMinutes * 60;
}
