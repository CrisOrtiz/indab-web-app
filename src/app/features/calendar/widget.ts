import { Language } from '../../core/i18n/i18n.service';

/** TradingView's free economic-calendar embed. It loads its data live from TradingView. */
export const WIDGET_SCRIPT = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';

/** TradingView's locale codes for our languages (Brazilian Portuguese is `br`). */
export const WIDGET_LOCALES: Record<Language, string> = {
  'es-419': 'es',
  'en-US': 'en',
  'pt-BR': 'br',
};

/** Economies whose news moves gold, USD/JPY and the NASDAQ; the first two are on by default. */
export const COUNTRIES = ['us', 'jp', 'eu', 'gb', 'cn'] as const;
export type Country = (typeof COUNTRIES)[number];
export const DEFAULT_COUNTRIES: Country[] = ['us', 'jp'];

/**
 * Impact levels, shown as ForexFactory's folders: red high, orange medium, yellow low.
 * TradingView's levels are -1 low, 0 medium and 1 high.
 */
export const IMPORTANCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];
export const DEFAULT_IMPORTANCE: Importance[] = ['high'];
const TRADINGVIEW_IMPORTANCE: Record<Importance, string> = { low: '-1', medium: '0', high: '1' };

export interface CalendarFilters {
  countries: Country[];
  importance: Importance[];
}

/** The JSON the embed script reads from its own tag. */
export function widgetConfig(filters: CalendarFilters, language: Language) {
  return {
    colorTheme: 'light',
    isTransparent: true,
    locale: WIDGET_LOCALES[language],
    importanceFilter: (['low', 'medium', 'high'] as const)
      .filter((level) => filters.importance.includes(level))
      .map((level) => TRADINGVIEW_IMPORTANCE[level])
      .join(','),
    countryFilter: COUNTRIES.filter((c) => filters.countries.includes(c)).join(','),
    width: '100%',
    height: 640,
  };
}
