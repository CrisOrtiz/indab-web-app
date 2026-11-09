import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FeatureFlags } from '../../../core/features/feature-flags.service';
import { I18n } from '../../../core/i18n/i18n.service';
import {
  FEATURE_KEYS,
  FEATURE_MODES,
  FeatureKey,
  FeatureMode,
} from '../../../core/models/feature-flags';

/**
 * `/admin/features` (admins): who sees each section of the app, as feature flags. A change is
 * saved at once and reaches every open browser through `FeatureFlags`' listener.
 */
@Component({
  selector: 'app-admin-features',
  imports: [RouterLink],
  templateUrl: './admin-features.html',
  styleUrls: ['../admin.scss', './admin-features.scss'],
})
export class AdminFeatures {
  protected readonly flags = inject(FeatureFlags);
  protected readonly i18n = inject(I18n);

  protected readonly keys = FEATURE_KEYS;
  protected readonly modes = FEATURE_MODES;
  protected readonly loading = signal(true);
  protected readonly busy = signal<FeatureKey | null>(null);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  constructor() {
    void this.flags.whenReady().finally(() => this.loading.set(false));
  }

  protected modeOf(key: FeatureKey): FeatureMode {
    return this.flags.flags()[key] ?? 'on';
  }

  protected async choose(key: FeatureKey, mode: FeatureMode): Promise<void> {
    if (this.modeOf(key) === mode || this.busy()) {
      return;
    }
    const t = this.i18n.messages().featureFlags;
    this.busy.set(key);
    this.message.set(null);
    try {
      await this.flags.setMode(key, mode);
      this.message.set({ kind: 'ok', text: t.saved(t.items[key].title, t.modes[mode]) });
    } catch {
      this.message.set({ kind: 'error', text: t.failed });
    } finally {
      this.busy.set(null);
    }
  }
}
