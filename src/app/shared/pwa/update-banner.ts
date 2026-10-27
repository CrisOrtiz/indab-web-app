import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { AppUpdates } from '../../core/pwa/app-updates.service';
import { Icon } from '../icon/icon';

/** "A new version is ready" strip at the bottom of the window, with a reload button. */
@Component({
  selector: 'app-update-banner',
  imports: [Icon],
  template: `
    @if (updates.ready()) {
      @let t = i18n.messages().pwa;
      <div class="banner" role="status">
        <span>{{ t.updateReady }}</span>
        <button type="button" class="btn" (click)="updates.reload()">{{ t.reload }}</button>
        <button
          type="button"
          class="close"
          [attr.aria-label]="t.later"
          [title]="t.later"
          (click)="updates.dismiss()"
        >
          <app-icon name="close" [size]="18" />
        </button>
      </div>
    }
  `,
  styleUrl: './update-banner.scss',
})
export class UpdateBanner {
  protected readonly i18n = inject(I18n);
  protected readonly updates = inject(AppUpdates);
}
