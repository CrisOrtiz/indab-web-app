import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
import { LanguageSwitcher } from './language-switcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => localStorage.clear());

  const setup = async () => {
    const fixture = TestBed.createComponent(LanguageSwitcher);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('.current')!;
    const items = () => [...el.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    const open = async () => {
      button.click();
      await fixture.whenStable();
    };
    return { fixture, el, button, items, open };
  };

  it('shows the current language as a flag button with a translated label', async () => {
    const { el, button } = await setup();
    expect(button.getAttribute('aria-label')).toBe('Idioma: Español');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent?.trim()).toBe('ES');
    expect(el.querySelector('app-flag svg')).not.toBeNull();
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });

  it('lists the three languages with their flags and switches to the one picked', async () => {
    const { fixture, el, button, items, open } = await setup();
    await open();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(items().map((i) => i.textContent?.trim())).toEqual(['Español', 'English', 'Português']);
    expect(items().map((i) => i.getAttribute('lang'))).toEqual(['es-419', 'en-US', 'pt-BR']);
    expect(items().map((i) => i.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(items().every((i) => i.querySelector('app-flag svg'))).toBe(true);

    items()[1].click();
    await vi.waitFor(() => expect(TestBed.inject(I18n).language()).toBe('en-US'));
    await fixture.whenStable();
    expect(el.querySelector('[role="menu"]')).toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Language: English');
    expect(button.textContent?.trim()).toBe('EN');
    expect(localStorage.getItem('indab.language')).toBe('en-US');
  });

  it('closes on Escape or an outside click, and moves through the languages with arrows', async () => {
    const { fixture, el, items, open } = await setup();
    await open();
    await vi.waitFor(() => expect(document.activeElement).toBe(items()[0]));
    const menu = el.querySelector('[role="menu"]')!;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items()[1]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items()[2]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(el.querySelector('[role="menu"]')).toBeNull();

    await open();
    document.body.click();
    await fixture.whenStable();
    expect(el.querySelector('[role="menu"]')).toBeNull();
  });
});
