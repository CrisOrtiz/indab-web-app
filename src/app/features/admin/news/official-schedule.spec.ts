import { joblessClaimsDates, newYorkTime, officialSchedule } from './official-schedule';

describe('official schedule', () => {
  it('turns New York times into UTC, with daylight time from March to November', () => {
    expect(newYorkTime('2026-01-09', '08:30')).toBe(Date.parse('2026-01-09T13:30:00Z') / 1000);
    // Daylight time starts on Sunday 8 March 2026 and ends on Sunday 1 November.
    expect(newYorkTime('2026-03-06', '08:30')).toBe(Date.parse('2026-03-06T13:30:00Z') / 1000);
    expect(newYorkTime('2026-03-11', '08:30')).toBe(Date.parse('2026-03-11T12:30:00Z') / 1000);
    expect(newYorkTime('2026-10-28', '14:00')).toBe(Date.parse('2026-10-28T18:00:00Z') / 1000);
    expect(newYorkTime('2026-11-06', '08:30')).toBe(Date.parse('2026-11-06T13:30:00Z') / 1000);
  });

  it('puts jobless claims on Thursdays, a day earlier on holidays', () => {
    const dates = joblessClaimsDates(2026);
    expect(dates[0]).toBe('2025-12-31');
    expect(dates[1]).toBe('2026-01-08');
    expect(dates).toContain('2026-11-25');
    expect(dates).not.toContain('2026-11-26');
    expect(dates).toHaveLength(53);
  });

  it('lists every release once, with a fixed id, oldest first', () => {
    const schedule = officialSchedule();
    const ids = schedule.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(schedule.map((e) => e.time)).toEqual(
      [...schedule.map((e) => e.time)].sort((a, b) => a - b),
    );
    expect(schedule.find((e) => e.id === 'official-nfp-2026-11-06')).toEqual({
      id: 'official-nfp-2026-11-06',
      time: Date.parse('2026-11-06T13:30:00Z') / 1000,
      name: 'Non-Farm Payrolls',
      country: 'US',
      impact: 'high',
      actual: null,
      forecast: null,
      previous: null,
    });
    expect(schedule.filter((e) => e.name === 'FOMC Rate Decision')).toHaveLength(8);
  });
});
