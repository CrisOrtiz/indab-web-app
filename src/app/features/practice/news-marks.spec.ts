import { NewsEvent } from '../../core/models/market-news';
import { newsMarks } from './news-marks';

const release = (time: number, impact: NewsEvent['impact'] = 'high', name = 'NFP'): NewsEvent => ({
  id: `${name}${time}`,
  time,
  name,
  country: 'US',
  impact,
  period: null,
  actual: null,
  prior: null,
  consensus: null,
  unit: null,
  source: null,
});

// Bars every 60 s at 0, 60, 120 (the market was closed from 120 to 600), 600; bar i at x = 10i.
const times = [0, 60, 120, 600];
const toX = (index: number) => index * 10;

describe('newsMarks', () => {
  it('puts each release on the bar it falls in, one icon per bar with the strongest impact', () => {
    const marks = newsMarks(
      [release(65, 'medium', 'CPI'), release(70, 'high', 'NFP'), release(130, 'medium')],
      times,
      60,
      toX,
      700,
    );
    expect(marks.map((m) => [m.key, m.x, m.impact, m.released])).toEqual([
      [1, 10, 'high', true],
      // Released while the market was closed: on the last bar before.
      [2, 20, 'medium', true],
    ]);
    expect(marks[0].events.map((e) => e.event.name)).toEqual(['NFP', 'CPI']);
  });

  it('puts news still to come where its bar will be, and drops what is off screen', () => {
    const marks = newsMarks(
      [release(-10), release(630), release(780), release(6000)],
      times,
      60,
      toX,
      700,
    );
    expect(marks.map((m) => [m.key, m.released])).toEqual([
      // Inside the last bar, after it started: not out yet.
      [3, false],
      [6, false],
    ]);
  });

  it('counts a release as out once the last bar starts at or after it', () => {
    expect(newsMarks([release(600)], times, 60, toX, 700)[0].released).toBe(true);
    const mixed = newsMarks([release(600), release(610, 'medium')], times, 60, toX, 700);
    expect(mixed[0].released).toBe(false);
  });

  it('guesses the bar length from the bars, and draws nothing without bars or news', () => {
    expect(newsMarks([release(1300)], [0, 600, 1200], 0, toX, 700)[0].key).toBe(2);
    expect(newsMarks([release(10)], [], 60, toX, 700)).toEqual([]);
    expect(newsMarks([], times, 60, toX, 700)).toEqual([]);
    expect(newsMarks([release(70)], times, 60, () => null, 700)).toEqual([]);
  });
});
