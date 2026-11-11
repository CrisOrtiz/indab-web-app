import { dayRange, inRange } from './practice-format';

describe('replay start day range', () => {
  const range = { min: '2026-01-11', max: '2026-10-11' };

  it('accepts only days inside the range', () => {
    expect(inRange('2026-01-11', range)).toBe(true);
    expect(inRange('2026-10-11', range)).toBe(true);
    expect(inRange('2026-11-09', range)).toBe(false);
    expect(inRange('2025-12-31', range)).toBe(false);
    expect(inRange('', range)).toBe(false);
  });

  it('writes the first and last days out in the site language, in UTC', () => {
    expect(dayRange(range, 'en-US')).toEqual({ from: 'Jan 11, 2026', to: 'Oct 11, 2026' });
  });
});
