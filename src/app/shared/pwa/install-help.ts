import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { AppInstall } from '../../core/pwa/app-install.service';
import { Icon } from '../icon/icon';

/** iPhone and iPad have no install prompt: this explains Share > Add to Home Screen. */
@Component({
  selector: 'app-install-help',
  imports: [Icon],
  host: { '(document:keydown.escape)': 'install.closeHelp()' },
  template: `
    @if (install.helpOpen()) {
      @let t = i18n.messages().pwa;
      <div class="backdrop" (click)="install.closeHelp()"></div>
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-help-title"
        tabindex="-1"
        #dialog
      >
        <div class="head">
          <img src="icon-192.png" alt="" width="48" height="48" />
          <div>
            <h2 id="install-help-title">{{ t.iosTitle }}</h2>
            <p>{{ t.iosIntro }}</p>
          </div>
        </div>
        <ol>
          <li>
            <app-icon name="share" [size]="22" />
            <span>{{ t.iosStepShare }}</span>
          </li>
          <li>
            <app-icon name="addSquare" [size]="22" />
            <span>{{ t.iosStepAdd }}</span>
          </li>
          <li>
            <app-icon name="check" [size]="22" />
            <span>{{ t.iosStepConfirm }}</span>
          </li>
        </ol>
        <button type="button" class="btn" (click)="install.closeHelp()">{{ t.gotIt }}</button>
      </div>
    }
  `,
  styleUrl: './install-help.scss',
})
export class InstallHelp {
  protected readonly i18n = inject(I18n);
  protected readonly install = inject(AppInstall);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    // Screen readers start on the dialog.
    effect(() => this.dialog()?.nativeElement.focus());
  }
}
