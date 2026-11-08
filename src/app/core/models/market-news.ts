import type { Timestamp } from 'firebase/firestore';

/** Impact of a release: red, orange and yellow on the chart, as on the calendar page. */
export type NewsImpact = 'high' | 'medium' | 'low';

export const NEWS_IMPACTS: readonly NewsImpact[] = ['high', 'medium', 'low'];

/** Countries trainers pick from: the US moves gold; Japan for USD/JPY later. */
export const NEWS_COUNTRIES = ['US', 'JP'] as const;
export type NewsCountry = (typeof NEWS_COUNTRIES)[number];

/**
 * Stored at `marketNews/{id}`: an economic release (a figure or a central-bank decision) shown
 * on the practice chart. INDAB's own calendar: trainers and admins enter and correct them at
 * `/admin/news`, starting from the official US schedules loaded with "Cargar fechas oficiales".
 * Figures are free text as the publisher writes them ('254K', '4.1%').
 */
export interface NewsEvent {
  id: string;
  /** Release time, seconds since 1970 (UTC), like the candles. */
  time: number;
  name: string;
  country: NewsCountry;
  impact: NewsImpact;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

/** The stored document, with who last changed it. */
export interface NewsDocument extends Omit<NewsEvent, 'id'> {
  updatedBy: string;
  updatedAt: Timestamp;
}

/** What staff fill in. */
export type NewsInput = Omit<NewsEvent, 'id'>;

/** Limits, mirrored by `firestore.rules`. */
export const NEWS_NAME_MAX = 80;
export const NEWS_FIGURE_MAX = 20;

/**
 * How the practice chart shows the news. `full`: name, time and figures (dates shown).
 * `reveal`: dates hidden, so a release shows only its impact until the replay reaches its time,
 * then its name and figures (never the date). `impact`: only the impact, all along. `off`: none.
 * Evaluations pick theirs (`Evaluation.news`); free practice follows "hide dates".
 */
export type NewsMode = 'full' | 'reveal' | 'impact' | 'off';

/** What evaluation creators pick from; the first is the default. */
export const EVALUATION_NEWS = ['reveal', 'impact', 'off'] as const;
export type EvaluationNews = (typeof EVALUATION_NEWS)[number];

/**
 * How a chart shows the news. While an evaluation attempt runs, its creator's pick holds
 * (`reveal` turning into `full` when the evaluation shows dates); otherwise hidden dates mean
 * `reveal` and shown dates `full`.
 */
export function newsModeFor(
  evaluationNews: EvaluationNews | null,
  attemptRunning: boolean,
  datesHidden: boolean,
): NewsMode {
  if (evaluationNews && attemptRunning && evaluationNews !== 'reveal') {
    return evaluationNews;
  }
  return datesHidden ? 'reveal' : 'full';
}

/** Whether a figure or name typed by staff is acceptable. */
export function validNews(input: NewsInput): boolean {
  const figure = (value: string | null) => value === null || value.length <= NEWS_FIGURE_MAX;
  return (
    Number.isInteger(input.time) &&
    input.time > 0 &&
    input.name.trim().length > 0 &&
    input.name.length <= NEWS_NAME_MAX &&
    NEWS_COUNTRIES.includes(input.country) &&
    NEWS_IMPACTS.includes(input.impact) &&
    figure(input.actual) &&
    figure(input.forecast) &&
    figure(input.previous)
  );
}
