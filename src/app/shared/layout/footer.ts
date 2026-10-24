import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';

/** Copyright and developer credit, at the bottom of every page. */
@Component({
  selector: 'app-footer',
  template: `
    @let t = i18n.messages().footer;
    <footer class="container">
      <span>{{ t.rights(year) }}</span>
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
  protected readonly year = new Date().getFullYear();
}
