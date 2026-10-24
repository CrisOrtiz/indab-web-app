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

/** `high` shows only high-impact events; `medium` adds medium-impact ones. */
export type Importance = 'high' | 'medium';

export interface CalendarFilters {
  countries: Country[];
  importance: Importance;
}

/** The JSON the embed script reads from its own tag. */
export function widgetConfig(filters: CalendarFilters, language: Language) {
  return {
    colorTheme: 'light',
    isTransparent: true,
    locale: WIDGET_LOCALES[language],
    // TradingView's importance levels: -1 low, 0 medium, 1 high.
    importanceFilter: filters.importance === 'high' ? '1' : '0,1',
    countryFilter: COUNTRIES.filter((c) => filters.countries.includes(c)).join(','),
    width: '100%',
    height: 640,
  };
}
