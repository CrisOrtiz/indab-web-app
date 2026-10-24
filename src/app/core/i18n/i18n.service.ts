import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Messages, es } from './messages/es';

export type Language = 'es-419' | 'en-US' | 'pt-BR';

export const DEFAULT_LANGUAGE: Language = 'es-419';

/** The languages offered in the switcher, each named in itself. */
export const LANGUAGES: { code: Language; name: string; short: string }[] = [
  { code: 'es-419', name: 'Español', short: 'ES' },
  { code: 'en-US', name: 'English', short: 'EN' },
  { code: 'pt-BR', name: 'Português', short: 'PT' },
];

/** localStorage key of the visitor's choice. */
export const LANGUAGE_KEY = 'indab.language';

// Spanish is bundled; the other languages load the first time they are used.
const loaders: Record<Language, () => Promise<Messages>> = {
  'es-419': async () => es,
  'en-US': () => import('./messages/en').then((m) => m.en),
  'pt-BR': () => import('./messages/pt').then((m) => m.pt),
};

const isLanguage = (value: unknown): value is Language => LANGUAGES.some((l) => l.code === value);

/**
 * Runtime translations. Templates read `messages()` (typed, so a missing key fails the build)
 * and re-render when the language changes, without reloading the page. The choice is kept in
 * localStorage; first-time visitors get Spanish, the academy's main language.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly document = inject(DOCUMENT);
  private readonly loaded = signal<Partial<Record<Language, Messages>>>({ 'es-419': es });
  private readonly _language = signal<Language>(DEFAULT_LANGUAGE);

  readonly language = this._language.asReadonly();
  readonly messages = computed(() => this.loaded()[this._language()] ?? es);

  /** Restores the saved language. The app waits for it, so the first render is translated. */
  async init(): Promise<void> {
    const saved = this.storage((s) => s.getItem(LANGUAGE_KEY));
    if (isLanguage(saved) && saved !== DEFAULT_LANGUAGE) {
      await this.use(saved, false);
    } else {
      this.applyToDocument(DEFAULT_LANGUAGE);
    }
  }

  /** Switches the whole site to `language` and remembers it. */
  async use(language: Language, remember = true): Promise<void> {
    if (!this.loaded()[language]) {
      try {
        const messages = await loaders[language]();
        this.loaded.update((all) => ({ ...all, [language]: messages }));
      } catch {
        // Offline or a stale deploy: stay in the current language.
        return;
      }
    }
    this._language.set(language);
    this.applyToDocument(language);
    if (remember) {
      this.storage((s) => s.setItem(LANGUAGE_KEY, language));
    }
  }

  private applyToDocument(language: Language): void {
    this.document.documentElement.lang = language;
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
