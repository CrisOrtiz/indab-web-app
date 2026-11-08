import { Provider, signal } from '@angular/core';
import { NewsEvent } from '../../core/models/market-news';
import { ChartSettingsService } from './chart-settings.service';
import { NewsService } from './news.service';
import { IndicatorConfig } from './indicators';

/**
 * For specs of pages with the replay chart: chart settings that read and write nothing, with
 * `indicators` and `news` to set what a user saved, and no economic news (set `newsEvents`). Wrap a method in `vi.fn` to check a call.
 */
export function quietChartSettings() {
  const indicators = signal<readonly string[] | null>(null);
  const news = signal(true);
  const configs = signal<Readonly<Record<string, IndicatorConfig>>>({});
  const settings = {
    indicators,
    configs,
    news,
    saveNews: async (on: boolean) => news.set(on),
    load: async () => undefined,
    saveIndicators: async (list: readonly string[]) => indicators.set(list),
    saveConfigs: async (value: Readonly<Record<string, IndicatorConfig>>) => configs.set(value),
  };
  // The news feed reads nothing either; set `newsEvents` to show some.
  const newsEvents = signal<NewsEvent[]>([]);
  const newsService = { feed: () => newsEvents.asReadonly(), month: async () => [] };
  const providers: Provider[] = [
    { provide: ChartSettingsService, useValue: settings },
    { provide: NewsService, useValue: newsService },
  ];
  return { settings, providers, newsEvents };
}
