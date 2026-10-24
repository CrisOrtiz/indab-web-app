import { goldClosed, newYorkOffset, nextGoldOpen } from './market-hours';

const HOUR = 3_600_000;

describe('newYorkOffset', () => {
  it('follows US daylight saving time', () => {
    // 2026: summer time from 8 March 07:00 UTC to 1 November 06:00 UTC.
    expect(newYorkOffset(Date.UTC(2026, 2, 8, 6, 59))).toBe(-5);
    expect(newYorkOffset(Date.UTC(2026, 2, 8, 7))).toBe(-4);
    expect(newYorkOffset(Date.UTC(2026, 9, 31, 12))).toBe(-4);
    expect(newYorkOffset(Date.UTC(2026, 10, 1, 6))).toBe(-5);
  });
});

describe('goldClosed', () => {
  it('closes from Friday 17:00 to Sunday 18:00 New York time, in summer and winter', () => {
    // Friday 23 October 2026 (summer): open until 20:59 UTC.
    expect(goldClosed(Date.UTC(2026, 9, 23, 20, 59))).toBe(false);
    expect(goldClosed(Date.UTC(2026, 9, 23, 21))).toBe(true);
    expect(goldClosed(Date.UTC(2026, 9, 24, 12))).toBe(true);
    expect(goldClosed(Date.UTC(2026, 9, 25, 21, 59))).toBe(true);
    expect(goldClosed(Date.UTC(2026, 9, 25, 22))).toBe(false);
    // Winter: an hour later in UTC.
    expect(goldClosed(Date.UTC(2026, 0, 9, 21, 30))).toBe(false);
    expect(goldClosed(Date.UTC(2026, 0, 9, 22))).toBe(true);
    expect(goldClosed(Date.UTC(2026, 0, 11, 22, 30))).toBe(true);
    expect(goldClosed(Date.UTC(2026, 0, 11, 23))).toBe(false);
  });

  it('closes for the daily break from 17:00 to 18:00 New York time', () => {
    // Wednesday 21 October 2026.
    expect(goldClosed(Date.UTC(2026, 9, 21, 20, 59))).toBe(false);
    expect(goldClosed(Date.UTC(2026, 9, 21, 21, 30))).toBe(true);
    expect(goldClosed(Date.UTC(2026, 9, 21, 22))).toBe(false);
  });
});

describe('nextGoldOpen', () => {
  it('moves a closed time to the first open step', () => {
    const saturday = Date.UTC(2026, 9, 24, 8);
    expect(nextGoldOpen(saturday, 4 * HOUR)).toBe(Date.UTC(2026, 9, 26, 0));
    expect(nextGoldOpen(saturday, 60_000)).toBe(Date.UTC(2026, 9, 25, 22));
    const tuesday = Date.UTC(2026, 9, 20, 12);
    expect(nextGoldOpen(tuesday, 4 * HOUR)).toBe(tuesday);
  });
});
