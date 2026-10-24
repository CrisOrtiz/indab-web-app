import { TestBed } from '@angular/core/testing';
import { DEFAULT_LANGUAGE, I18n, LANGUAGE_KEY } from './i18n.service';
import { en } from './messages/en';
import { es } from './messages/es';
import { pt } from './messages/pt';

/** Every path to a leaf (with array lengths), to compare the shape of two dictionaries. */
function shape(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => shape(v, `${path}.${key}`));
  }
  return [`${path}:${typeof value}`];
}

describe('I18n', () => {
  let i18n: I18n;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
    i18n = TestBed.inject(I18n);
  });

  it('starts in Latin American Spanish', async () => {
    await i18n.init();
    expect(i18n.language()).toBe(DEFAULT_LANGUAGE);
    expect(i18n.messages()).toBe(es);
    expect(document.documentElement.lang).toBe('es-419');
  });

  it('switches language, updates <html lang> and remembers the choice', async () => {
    await i18n.use('en-US');
    expect(i18n.messages()).toBe(en);
    expect(document.documentElement.lang).toBe('en-US');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en-US');

    await i18n.use('pt-BR');
    expect(i18n.messages().header.signIn).toBe('Entrar');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('pt-BR');
  });

  it('restores the saved language on start', async () => {
    localStorage.setItem(LANGUAGE_KEY, 'pt-BR');
    await i18n.init();
    expect(i18n.language()).toBe('pt-BR');
    expect(i18n.messages()).toBe(pt);
  });

  it('ignores an unknown saved language', async () => {
    localStorage.setItem(LANGUAGE_KEY, 'fr-FR');
    await i18n.init();
    expect(i18n.language()).toBe('es-419');
  });

  it('has the same texts, lists and placeholders in every language', () => {
    expect(shape(en)).toEqual(shape(es));
    expect(shape(pt)).toEqual(shape(es));
  });
});
