import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { AppInstall } from '../../core/pwa/app-install.service';
import { Icon } from '../icon/icon';

/**
 * Copyright and developer credit, at the bottom of every page, plus "Install app" where the
 * browser can install the site (visitors have no account menu, which also offers it).
 */
@Component({
  selector: 'app-footer',
  imports: [Icon],
  template: `
    @let t = i18n.messages().footer;
    <footer class="container">
      <span>{{ t.rights(year) }}</span>
      @if (install.available()) {
        <button type="button" class="install" (click)="install.install()">
          <app-icon name="download" [size]="14" />{{ i18n.messages().pwa.install }}
        </button>
      }
      <span>
        {{ t.builtBy }}
        <a href="https://crisortiz.github.io" target="_blank" rel="noopener">crisortizdev</a>
      </span>
    </footer>
  `,
  styleUrl: './footer.scss',
})
export class Footer {
  protected readonly i18n = inject(I18n);
  protected readonly install = inject(AppInstall);
  protected readonly year = new Date().getFullYear();
}
