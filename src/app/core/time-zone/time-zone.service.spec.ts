import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_TIME_ZONE,
  TIME_ZONE_KEY,
  TimeZoneService,
  fromZoneInput,
  timeZoneDefaults,
  offsetLabel,
  toZoneInput,
  zoneOffset,
} from './time-zone.service';

describe('TimeZoneService', () => {
  beforeEach(() => {
    localStorage.clear();
    timeZoneDefaults.zone = DEFAULT_TIME_ZONE;
  });
  afterEach(() => (timeZoneDefaults.zone = 'UTC'));

  it('starts in La Paz and remembers another zone', () => {
    const zones = TestBed.inject(TimeZoneService);
    expect(zones.zone()).toBe(DEFAULT_TIME_ZONE);
    expect(zones.label()).toBe('La Paz (UTC−04:00)');
    zones.use('America/Sao_Paulo');
    expect(zones.zone()).toBe('America/Sao_Paulo');
    expect(localStorage.getItem(TIME_ZONE_KEY)).toBe('America/Sao_Paulo');
  });

  it('ignores zones that do not exist', () => {
    localStorage.setItem(TIME_ZONE_KEY, 'Mars/Olympus');
    const zones = TestBed.inject(TimeZoneService);
    expect(zones.zone()).toBe(DEFAULT_TIME_ZONE);
    zones.use('Nowhere');
    expect(zones.zone()).toBe(DEFAULT_TIME_ZONE);
    expect(zones.options()).toContain('America/La_Paz');
  });

  it('gives offsets, following daylight saving', () => {
    expect(zoneOffset('America/La_Paz', Date.UTC(2026, 10, 3))).toBe('-0400');
    expect(zoneOffset('UTC', Date.UTC(2026, 10, 3))).toBe('+0000');
    expect(zoneOffset('Europe/Madrid', Date.UTC(2026, 6, 1))).toBe('+0200');
    expect(zoneOffset('Europe/Madrid', Date.UTC(2026, 0, 1))).toBe('+0100');
    expect(offsetLabel('-0400')).toBe('UTC−04:00');
  });

  it('reads and writes datetime-local values in a zone', () => {
    const time = Date.UTC(2026, 10, 3, 14, 30);
    expect(toZoneInput(time, 'America/La_Paz')).toBe('2026-11-03T10:30');
    expect(fromZoneInput('2026-11-03T10:30', 'America/La_Paz')).toBe(time);
    expect(fromZoneInput('2026-07-01T12:00', 'Europe/Madrid')).toBe(Date.UTC(2026, 6, 1, 10));
    expect(fromZoneInput('nope', 'UTC')).toBeNaN();
  });
});
