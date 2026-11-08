import { NewsImpact, NewsInput } from '../../../core/models/market-news';

/**
 * The 2026 release dates of the US figures that move gold, copied from the agencies' own
 * calendars (US government works, public domain): BLS (bls.gov/schedule/2026), the Federal
 * Reserve (FOMC calendar), BEA (bea.gov/news/schedule/full) and Census (retail release
 * schedule, which lists only September onwards). Times are New York time. Staff load them from
 * `/admin/news` and add figures or anything missing; to add another year, append its dates.
 */
interface Release {
  key: string;
  name: string;
  impact: NewsImpact;
  /** New York time, HH:MM. */
  at: string;
  dates: string[];
}

// prettier-ignore
export const OFFICIAL_RELEASES: Release[] = [
  {
    key: 'nfp',
    name: 'Non-Farm Payrolls',
    impact: 'high',
    at: '08:30',
    dates: [
      '2026-01-09', '2026-02-11', '2026-03-06', '2026-04-03', '2026-05-08', '2026-06-05',
      '2026-07-02', '2026-08-07', '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04',
    ],
  },
  {
    key: 'unemployment',
    name: 'Unemployment Rate',
    impact: 'high',
    at: '08:30',
    dates: [
      '2026-01-09', '2026-02-11', '2026-03-06', '2026-04-03', '2026-05-08', '2026-06-05',
      '2026-07-02', '2026-08-07', '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04',
    ],
  },
  {
    key: 'cpi',
    name: 'CPI (Consumer Price Index)',
    impact: 'high',
    at: '08:30',
    dates: [
      '2026-01-13', '2026-02-13', '2026-03-11', '2026-04-10', '2026-05-12', '2026-06-10',
      '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-14', '2026-11-10', '2026-12-10',
    ],
  },
  {
    key: 'ppi',
    name: 'PPI (Producer Price Index)',
    impact: 'medium',
    at: '08:30',
    dates: [
      '2026-01-14', '2026-01-30', '2026-02-27', '2026-03-18', '2026-04-14', '2026-05-13',
      '2026-06-11', '2026-07-15', '2026-08-13', '2026-09-10', '2026-10-15', '2026-11-13',
      '2026-12-15',
    ],
  },
  {
    key: 'jolts',
    name: 'JOLTS Job Openings',
    impact: 'medium',
    at: '10:00',
    dates: [
      '2026-01-07', '2026-02-05', '2026-03-13', '2026-03-31', '2026-05-05', '2026-06-02',
      '2026-06-30', '2026-08-04', '2026-09-01', '2026-09-29', '2026-11-03', '2026-12-01',
    ],
  },
  {
    key: 'fomc',
    name: 'FOMC Rate Decision',
    impact: 'high',
    at: '14:00',
    dates: [
      '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16',
      '2026-10-28', '2026-12-09',
    ],
  },
  {
    key: 'fomc-press',
    name: 'FOMC Press Conference',
    impact: 'high',
    at: '14:30',
    dates: [
      '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16',
      '2026-10-28', '2026-12-09',
    ],
  },
  {
    key: 'gdp-advance',
    name: 'GDP (Advance Estimate)',
    impact: 'high',
    at: '08:30',
    dates: ['2026-02-20', '2026-04-30', '2026-07-30', '2026-10-29'],
  },
  {
    key: 'gdp',
    name: 'GDP (Revised Estimate)',
    impact: 'medium',
    at: '08:30',
    dates: [
      '2026-01-22', '2026-03-13', '2026-04-09', '2026-05-28', '2026-06-25', '2026-08-26',
      '2026-09-30', '2026-11-25', '2026-12-23',
    ],
  },
  {
    key: 'pce',
    name: 'Core PCE Price Index',
    impact: 'high',
    at: '08:30',
    dates: [
      '2026-02-20', '2026-03-13', '2026-04-09', '2026-04-30', '2026-05-28', '2026-06-25',
      '2026-07-30', '2026-08-26', '2026-09-30', '2026-10-29', '2026-11-25', '2026-12-23',
    ],
  },
  {
    key: 'pce-jan',
    name: 'Core PCE Price Index',
    impact: 'high',
    at: '10:00',
    dates: ['2026-01-22'],
  },
  {
    key: 'retail',
    name: 'Retail Sales',
    impact: 'high',
    at: '08:30',
    dates: ['2026-10-15', '2026-11-17', '2026-12-16'],
  },
];

/**
 * Weekly jobless claims (Department of Labor): Thursdays at 8:30, a day earlier when the
 * Thursday is a federal holiday (New Year's Day 2026 and Thanksgiving).
 */
export function joblessClaimsDates(year: number): string[] {
  const holidays: Record<string, string> = {
    '2026-01-01': '2025-12-31',
    '2026-11-26': '2026-11-25',
  };
  const dates: string[] = [];
  const day = new Date(Date.UTC(year, 0, 1));
  while (day.getUTCDay() !== 4) {
    day.setUTCDate(day.getUTCDate() + 1);
  }
  while (day.getUTCFullYear() === year) {
    const date = day.toISOString().slice(0, 10);
    dates.push(holidays[date] ?? date);
    day.setUTCDate(day.getUTCDate() + 7);
  }
  return dates;
}

/**
 * Seconds (UTC) of a New York date and time. US daylight time runs from the second Sunday of
 * March to the first Sunday of November.
 */
export function newYorkTime(date: string, at: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = at.split(':').map(Number);
  const sunday = (m: number, nth: number) => {
    const first = new Date(Date.UTC(year, m, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + 7 * (nth - 1);
  };
  const dstStart = Date.UTC(year, 2, sunday(2, 2));
  const dstEnd = Date.UTC(year, 10, sunday(10, 1));
  const dayStart = Date.UTC(year, month - 1, day);
  const offset = dayStart >= dstStart && dayStart < dstEnd ? 4 : 5;
  return Date.UTC(year, month - 1, day, hours + offset, minutes) / 1000;
}

/** Every official release as a calendar entry, with a fixed id so loading twice adds nothing. */
export function officialSchedule(): (NewsInput & { id: string })[] {
  const releases: Release[] = [
    ...OFFICIAL_RELEASES,
    {
      key: 'claims',
      name: 'Initial Jobless Claims',
      impact: 'medium',
      at: '08:30',
      dates: joblessClaimsDates(2026),
    },
  ];
  return releases
    .flatMap((release) =>
      release.dates.map((date) => ({
        id: `official-${release.key}-${date}`,
        time: newYorkTime(date, release.at),
        name: release.name,
        country: 'US' as const,
        impact: release.impact,
        actual: null,
        forecast: null,
        previous: null,
      })),
    )
    .sort((a, b) => a.time - b.time || a.name.localeCompare(b.name));
}
