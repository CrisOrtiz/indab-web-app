import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

/** localStorage key of the chosen time zone. */
export const TIME_ZONE_KEY = 'indab.timeZone';

/** INDAB is in La Paz, so dates show in Bolivia's time until someone picks another zone. */
export const DEFAULT_TIME_ZONE = 'America/La_Paz';

/**
 * The zone used before anyone picks one. Unit tests set it to UTC (`src/test-setup.ts`), the
 * zone their dates are written in.
 */
export const timeZoneDefaults = { zone: DEFAULT_TIME_ZONE };

/** Zones offered in the profile (IANA names); the device's own zone is added when missing. */
export const TIME_ZONES = [
  'America/La_Paz',
  'America/Lima',
  'America/Bogota',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo',
  'America/Caracas',
  'America/Mexico_City',
  'America/New_York',
  'Europe/Madrid',
  'UTC',
];

const isZone = (zone: unknown): zone is string => {
  if (typeof zone !== 'string' || !zone) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/**
 * `+hhmm` offset of `zone` from UTC at `time` (ms), as Angular's `formatDate` takes it
 * ("-0400" for La Paz). It follows daylight saving where the zone has it.
 */
export function zoneOffset(zone: string, time: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(time));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const minutes = Math.round((asUtc - Math.floor(time / 60_000) * 60_000) / 60_000);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/** "UTC−04:00" for a `+hhmm` offset. */
export function offsetLabel(offset: string): string {
  return `UTC${offset[0] === '-' ? '−' : '+'}${offset.slice(1, 3)}:${offset.slice(3)}`;
}

/** A `datetime-local` value ("2026-11-03T10:00") for `time` (ms) as clocks in `zone` read it. */
export function toZoneInput(time: number, zone: string): string {
  const offset = zoneOffset(zone, time);
  const minutes = (offset[0] === '-' ? -1 : 1) * (+offset.slice(1, 3) * 60 + +offset.slice(3));
  return new Date(time + minutes * 60_000).toISOString().slice(0, 16);
}

/** The instant (ms) a `datetime-local` value means in `zone`, or NaN if it is not one. */
export function fromZoneInput(value: string, zone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return NaN;
  }
  const wall = Date.parse(`${value}:00Z`);
  // Guess with the offset at the wall time, then correct once (enough around DST changes).
  const shift = (time: number) => {
    const offset = zoneOffset(zone, time);
    return (offset[0] === '-' ? -1 : 1) * (+offset.slice(1, 3) * 60 + +offset.slice(3)) * 60_000;
  };
  const first = wall - shift(wall);
  return wall - shift(first);
}

/**
 * The time zone dates and chart times are shown in. Defaults to La Paz (Cris, 2026-11-03);
 * each user can pick another in their profile, kept in this browser.
 */
@Injectable({ providedIn: 'root' })
export class TimeZoneService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _zone = signal(timeZoneDefaults.zone);

  readonly zone = this._zone.asReadonly();

  constructor() {
    if (!this.browser) {
      return;
    }
    try {
      const saved = localStorage.getItem(TIME_ZONE_KEY);
      if (isZone(saved)) {
        this._zone.set(saved);
      }
    } catch {
      // Storage blocked: stay on the default.
    }
  }

  /** The zones to offer, with this device's zone and the chosen one when not in the list. */
  options(): string[] {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return [...new Set([...TIME_ZONES, ...[device, this._zone()].filter(isZone)])];
  }

  use(zone: string): void {
    if (!isZone(zone)) {
      return;
    }
    this._zone.set(zone);
    try {
      localStorage.setItem(TIME_ZONE_KEY, zone);
    } catch {
      // Kept for this visit only.
    }
  }

  /** "La Paz (UTC−04:00)": a zone as people read it. */
  label(zone = this._zone(), time = Date.now()): string {
    if (zone === 'UTC') {
      return 'UTC';
    }
    const city = zone.split('/').at(-1)!.replace(/_/g, ' ');
    return `${city} (${offsetLabel(zoneOffset(zone, time))})`;
  }

  /** The zone's `+hhmm` offset at `time` (ms). */
  offset(time: number): string {
    return zoneOffset(this._zone(), time);
  }
}
