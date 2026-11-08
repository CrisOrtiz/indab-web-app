import { NewsInput, newsModeFor, validNews } from './market-news';

const input = (extra: Partial<NewsInput> = {}): NewsInput => ({
  time: 1767965400,
  name: 'Non-Farm Payrolls',
  country: 'US',
  impact: 'high',
  actual: '50K',
  forecast: null,
  previous: '64K',
  ...extra,
});

describe('market news', () => {
  it('checks what staff type as the rules do', () => {
    expect(validNews(input())).toBe(true);
    expect(validNews(input({ time: NaN }))).toBe(false);
    expect(validNews(input({ time: 1.5 }))).toBe(false);
    expect(validNews(input({ name: '  ' }))).toBe(false);
    expect(validNews(input({ name: 'x'.repeat(81) }))).toBe(false);
    expect(validNews(input({ country: 'MX' as never }))).toBe(false);
    expect(validNews(input({ impact: 'huge' as never }))).toBe(false);
    expect(validNews(input({ actual: 'x'.repeat(21) }))).toBe(false);
  });

  it("follows hidden dates, and an evaluation creator's pick while an attempt runs", () => {
    // Free practice.
    expect(newsModeFor(null, true, false)).toBe('full');
    expect(newsModeFor(null, true, true)).toBe('reveal');
    // Evaluations.
    expect(newsModeFor('reveal', true, true)).toBe('reveal');
    expect(newsModeFor('reveal', true, false)).toBe('full');
    expect(newsModeFor('impact', true, true)).toBe('impact');
    expect(newsModeFor('off', true, false)).toBe('off');
    // Once over, the pick no longer holds.
    expect(newsModeFor('off', false, true)).toBe('reveal');
    expect(newsModeFor('impact', false, false)).toBe('full');
  });
});
