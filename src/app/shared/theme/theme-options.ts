import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { THEME_CHOICES, ThemeChoice, ThemeService } from '../../core/theme/theme.service';
import { Icon, IconName } from '../icon/icon';

const ICON: Record<ThemeChoice, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

/**
 * Light / dark / device switch, a row of three in the header's account menu. Picking one keeps
 * the menu open, so the user sees the change before closing it.
 */
@Component({
  selector: 'app-theme-options',
  imports: [Icon],
  template: `
    @let t = i18n.messages().header;
    <div class="theme" role="group" [attr.aria-label]="t.theme">
      <span class="label" aria-hidden="true">{{ t.theme }}</span>
      <div class="options">
        @for (choice of choices; track choice) {
          <button
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="theme.choice() === choice"
            [class.selected]="theme.choice() === choice"
            (click)="theme.use(choice)"
          >
            <app-icon [name]="icon[choice]" [size]="16" />
            <span>{{ t.themes[choice] }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styleUrl: './theme-options.scss',
})
export class ThemeOptions {
  protected readonly i18n = inject(I18n);
  protected readonly theme = inject(ThemeService);
  protected readonly choices = THEME_CHOICES;
  protected readonly icon = ICON;
}
