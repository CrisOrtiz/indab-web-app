import { Provider, signal } from '@angular/core';
import { ChartSettingsService } from './chart-settings.service';

/**
 * For specs of pages with the replay chart: chart settings that read and write nothing, with
 * `indicators` to set what a user saved. Wrap a method in `vi.fn` to check a call.
 */
export function quietChartSettings() {
  const indicators = signal<readonly string[] | null>(null);
  const settings = {
    indicators,
    load: async () => undefined,
    saveIndicators: async (list: readonly string[]) => indicators.set(list),
  };
  const providers: Provider[] = [{ provide: ChartSettingsService, useValue: settings }];
  return { settings, providers };
}
