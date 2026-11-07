import { formatFigure, monthKey, monthRange, monthsBetween, toNewsEvent } from './market-news';

const raw = (extra: Record<string, unknown> = {}) => ({
  id: 'us-bls-nfp-2026-01',
  series_code: 'us-nfp',
  title: 'Nonfarm Payrolls',
  country: 'US',
  category: 'economic-indicators',
  impact: 'high',
  release_at_utc: '2026-01-09T13:30:00+00:00',
  period: 'December 2025',
  status: 'released',
  unit: 'K',
  consensus: null,
  prior: 64,
  actual: '50',
  source_name: 'U.S. Bureau of Labor Statistics',
  ...extra,
});

describe('market news', () => {
  it('keeps a Finance Calendar release as the chart shows it', () => {
    expect(toNewsEvent(raw())).toEqual({
      id: 'us-bls-nfp-2026-01',
      time: Date.parse('2026-01-09T13:30:00Z') / 1000,
      name: 'Nonfarm Payrolls',
      country: 'US',
      impact: 'high',
      period: 'December 2025',
      actual: '50',
      prior: '64',
      consensus: null,
      unit: 'K',
      source: 'U.S. Bureau of Labor Statistics',
    });
    expect(toNewsEvent(raw({ title: undefined, name: 'NFP' }))?.name).toBe('NFP');
  });

  it('leaves out what the chart does not show', () => {
    expect(toNewsEvent(raw({ impact: 'low' }))).toBeNull();
    expect(toNewsEvent(raw({ country: 'JP' }))).toBeNull();
    expect(toNewsEvent(raw({ release_at_utc: null }))).toBeNull();
    expect(toNewsEvent(raw({ status: 'cancelled' }))).toBeNull();
    expect(toNewsEvent(raw({ all_day: true }))).toBeNull();
    expect(toNewsEvent(raw({ category: 'market-holidays' }))).toBeNull();
    expect(toNewsEvent(raw({ title: '', name: null, series_name: undefined }))).toBeNull();
  });

  it('names months in UTC and lists them across years', () => {
    expect(monthKey(Date.parse('2026-01-31T23:59:00Z') / 1000)).toBe('2026-01');
    expect(
      monthsBetween(
        Date.parse('2025-11-20T00:00:00Z') / 1000,
        Date.parse('2026-02-01T00:00:00Z') / 1000,
      ),
    ).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('prints figures with their unit', () => {
    expect(formatFigure('4.1', '%')).toBe('4.1%');
    expect(formatFigure('254000', null)).toBe('254,000');
    expect(formatFigure('254', 'K')).toBe('254 K');
    expect(formatFigure('n/a', 'K')).toBe('n/a K');
    expect(formatFigure(null, '%')).toBeNull();
  });
});
