import { Injectable } from '@angular/core';

/** Binance's server time, which the market data already comes from. */
export const SERVER_TIME_URL = 'https://fapi.binance.com/fapi/v1/time';

/**
 * The time by a server's clock rather than this device's, so an evaluation's countdown and
 * the candle it shows do not depend on a phone set a few minutes off. Until `sync` succeeds
 * (or if it fails) it is the device's clock.
 */
@Injectable({ providedIn: 'root' })
export class ServerClock {
  /** Server time minus device time (ms). */
  private offset = 0;
  private synced: Promise<void> | null = null;

  /** Now (ms), by the server's clock. */
  now(): number {
    return Date.now() + this.offset;
  }

  /** Measures the device's offset once per page load (again after a failure). */
  sync(): Promise<void> {
    this.synced ??= this.measure().catch(() => {
      this.synced = null;
    });
    return this.synced;
  }

  private async measure(): Promise<void> {
    const sent = Date.now();
    const response = await fetch(SERVER_TIME_URL);
    const received = Date.now();
    if (!response.ok) {
      throw new Error(`Server time: ${response.status}`);
    }
    const { serverTime } = (await response.json()) as { serverTime?: unknown };
    if (typeof serverTime !== 'number' || !Number.isFinite(serverTime)) {
      throw new Error('Server time: bad answer');
    }
    // The answer was written about halfway through the round trip.
    this.offset = serverTime - (sent + received) / 2;
  }
}
