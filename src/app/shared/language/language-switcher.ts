import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { I18n, LANGUAGES, Language } from '../../core/i18n/i18n.service';
import { Flag } from './flag';

/**
 * Language picker in the header: the current language's flag opens a menu with the three
 * languages. The choice is remembered on this device.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [Flag],
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(document:keydown.escape)': 'close(true)',
  },
  template: `
    @let t = i18n.messages().header;
    <button
      type="button"
      class="current"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      aria-controls="language-menu"
      [attr.aria-label]="t.currentLanguage(current().name)"
      [title]="t.currentLanguage(current().name)"
      (click)="toggle()"
    >
      <app-flag [language]="current().code" />
      <span class="code">{{ current().short }}</span>
      <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M3 4.5 6 7.5 9 4.5" />
      </svg>
    </button>
    @if (open()) {
      <div
        class="menu"
        id="language-menu"
        role="menu"
        [attr.aria-label]="t.language"
        (keydown)="moveFocus($event)"
      >
        @for (l of languages; track l.code) {
          <button
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="l.code === i18n.language()"
            [attr.lang]="l.code"
            (click)="pick(l.code)"
          >
            <app-flag [language]="l.code" />
            <span>{{ l.name }}</span>
            <svg class="check" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
            </svg>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }

    .current {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border: 1px solid transparent;
      border-radius: var(--radius);
      background: none;
      color: var(--color-text);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      cursor: pointer;
      transition:
        background-color 0.2s,
        border-color 0.2s;

      &:hover,
      &[aria-expanded='true'] {
        border-color: var(--color-border);
        background: var(--color-surface);
      }

      &:focus-visible {
        outline: 2px solid var(--color-accent);
        outline-offset: 2px;
      }
    }

    .chevron {
      width: 12px;
      height: 12px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 0.2s ease;
    }

    [aria-expanded='true'] .chevron {
      transform: rotate(180deg);
    }

    .menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 20;
      display: grid;
      min-width: 180px;
      padding: 6px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-bg);
      box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
      transform-origin: top right;
      animation: dropdown-in 0.16s ease-out;
    }

    .menu button {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 0;
      border-radius: calc(var(--radius) - 2px);
      background: none;
      color: var(--color-text);
      font: inherit;
      text-align: left;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        background: var(--color-surface);
        outline: none;
      }

      &[aria-checked='true'] {
        font-weight: 600;
      }
    }

    .check {
      width: 16px;
      height: 16px;
      margin-left: auto;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      visibility: hidden;
    }

    [aria-checked='true'] .check {
      visibility: visible;
    }
  `,
})
export class LanguageSwitcher {
  protected readonly i18n = inject(I18n);
  protected readonly languages = LANGUAGES;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly current = computed(
    () => LANGUAGES.find((l) => l.code === this.i18n.language()) ?? LANGUAGES[0],
  );

  protected toggle(): void {
    this.open.update((open) => !open);
    if (this.open()) {
      // Put the keyboard on the current language once the menu is drawn.
      setTimeout(() =>
        this.items()
          .find((i) => i.ariaChecked === 'true')
          ?.focus(),
      );
    }
  }

  /** Closes the menu; with `returnFocus`, gives the focus back to the flag button. */
  protected close(returnFocus = false): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (returnFocus) {
      this.host.nativeElement.querySelector<HTMLElement>('.current')?.focus();
    }
  }

  protected closeOnOutsideClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected async pick(language: Language): Promise<void> {
    this.close(true);
    await this.i18n.use(language);
  }

  /** Arrow keys, Home and End move between the languages, as in any menu. */
  protected moveFocus(event: KeyboardEvent): void {
    const items = this.items();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      items[next].focus();
    }
  }

  private items(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
  }
}
