import { liveMinutes, marketCovered } from './live';

describe('liveMinutes', () => {
  it('counts the minutes the clock has reached at the pace', () => {
    expect(liveMinutes(0, 60, 30)).toBe(0);
    expect(liveMinutes(999, 60, 30)).toBe(0);
    expect(liveMinutes(1_000, 60, 30)).toBe(1);
    expect(liveMinutes(90_000, 1, 30)).toBe(1);
    expect(liveMinutes(2_000, 900, 30)).toBe(30);
  });

  it('never goes past the time limit nor before the start', () => {
    expect(liveMinutes(31 * 60_000, 60, 30)).toBe(1800);
    expect(liveMinutes(-5_000, 60, 30)).toBe(0);
  });

  it('tells the market time an evaluation covers, in seconds', () => {
    expect(marketCovered(60, 60)).toBe(60 * 60 * 60);
    expect(marketCovered(1, 30)).toBe(30 * 60);
  });
});
