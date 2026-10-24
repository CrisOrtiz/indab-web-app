import { Component, inject } from '@angular/core';
import { I18n, LANGUAGES, Language } from '../../core/i18n/i18n.service';

/** Language picker in the header; the choice is remembered on this device. */
@Component({
  selector: 'app-language-switcher',
  template: `
    <select
      [attr.aria-label]="i18n.messages().header.language"
      [title]="i18n.messages().header.language"
      (change)="i18n.use($any($event.target).value)"
    >
      @for (l of languages; track l.code) {
        <option [value]="l.code" [selected]="l.code === i18n.language()" [attr.lang]="l.code">
          {{ l.short }} · {{ l.name }}
        </option>
      }
    </select>
  `,
  styles: `
    select {
      padding: 6px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-bg);
      color: var(--color-text);
      font: inherit;
      font-size: 0.875rem;
      cursor: pointer;
    }
  `,
})
export class LanguageSwitcher {
  protected readonly i18n = inject(I18n);
  protected readonly languages: { code: Language; name: string; short: string }[] = LANGUAGES;
}
