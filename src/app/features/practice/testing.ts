import { Component, Provider, input, model, output, signal } from '@angular/core';
import { Candle, OrderType } from '../../core/models/practice';
import { NewsEvent } from '../../core/models/market-news';
import { ChartSettingsService } from './chart-settings.service';
import { NewsService } from './news.service';
import { IndicatorConfig } from './indicators';
import type { LevelMove, LevelRemove, LevelsMove, OrderAt, OrderDraft } from './replay-chart';

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

// The real chart needs a canvas; the page only passes it data.
@Component({ selector: 'app-replay-chart', template: '<ng-content />' })
export class FakeChart {
  readonly candles = input<Candle[]>([]);
  readonly trades = input<unknown[]>([]);
  readonly hideDates = input(false);
  readonly barSeconds = input(0);
  readonly draft = input<OrderDraft | null>(null);
  readonly trading = input(false);
  readonly lots = input(0);
  readonly focusTrade = input<string | null>(null);
  readonly startTime = input<number | null>(null);
  readonly indicators = input<readonly string[] | null>(null);
  readonly indicatorsChange = output<string[]>();
  readonly news = input<readonly unknown[]>([]);
  readonly newsMode = input<unknown>('full');
  readonly showNews = input(true);
  readonly showNewsChange = output<boolean>();
  readonly indicatorConfigs = input<unknown>(null);
  readonly indicatorConfigsChange = output<unknown>();
  readonly levelMoved = output<LevelMove>();
  readonly levelsMoved = output<LevelsMove>();
  readonly levelRemoved = output<LevelRemove>();
  readonly levelAdded = output<LevelRemove>();
  readonly draftDiscarded = output<void>();
  readonly draftTypeChanged = output<OrderType>();
  readonly tradeClosed = output<string>();
  readonly symbol = input('');
  readonly draftSubmitted = output<void>();
  readonly lotsChanged = output<string>();
  readonly orderAt = output<OrderAt>();
  readonly drawings = model<unknown[]>([]);
}
