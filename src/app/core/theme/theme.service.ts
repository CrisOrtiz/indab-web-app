import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

/** What the user picked: follow the device, or always light or dark. */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

/** localStorage key of the choice; the script in index.html reads it before the first paint. */
export const THEME_KEY = 'indab.theme';

export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];

/** Browser bar color per theme (`<meta name="theme-color">`), the page background. */
const BAR_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#121212' };

const isChoice = (value: unknown): value is ThemeChoice =>
  THEME_CHOICES.includes(value as ThemeChoice);

/**
 * Light or dark mode. First-time visitors follow their device; a choice from the account menu
 * is kept in localStorage. The theme is the `data-theme` attribute on <html>, which switches the
 * color tokens in styles.scss; it is set right away (not in an effect) so components reacting to
 * `theme()` (the practice chart) already read the new colors. Nothing runs while prerendering:
 * the script in index.html sets the attribute before the app starts.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _choice = signal<ThemeChoice>('system');
  private readonly systemDark = signal(false);

  readonly choice = this._choice.asReadonly();
  readonly theme = computed<Theme>(() => {
    const choice = this._choice();
    return choice === 'system' ? (this.systemDark() ? 'dark' : 'light') : choice;
  });

  constructor() {
    if (!this.browser) {
      return;
    }
    const saved = this.storage((s) => s.getItem(THEME_KEY));
    this._choice.set(isChoice(saved) ? saved : 'system');
    const query = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    if (query) {
      this.systemDark.set(query.matches);
      const onChange = (event: MediaQueryListEvent) => {
        this.systemDark.set(event.matches);
        this.apply();
      };
      query.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
    }
    this.apply();
  }

  /** Switches the whole site to `choice` and remembers it on this browser. */
  use(choice: ThemeChoice): void {
    this._choice.set(choice);
    this.apply();
    this.storage((s) =>
      choice === 'system' ? s.removeItem(THEME_KEY) : s.setItem(THEME_KEY, choice),
    );
  }

  private apply(): void {
    if (!this.browser) {
      return;
    }
    const theme = this.theme();
    this.document.documentElement.dataset['theme'] = theme;
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', BAR_COLORS[theme]);
  }

  /** localStorage can be missing or throw (private mode, blocked cookies). */
  private storage<T>(use: (storage: Storage) => T): T | null {
    try {
      return use(this.document.defaultView!.localStorage);
    } catch {
      return null;
    }
  }
}
