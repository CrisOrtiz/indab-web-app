import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
import { THEME_KEY, ThemeService } from '../../core/theme/theme.service';
import { ThemeOptions } from './theme-options';

describe('ThemeOptions', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  const setup = async () => {
    const fixture = TestBed.createComponent(ThemeOptions);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const items = () => [...el.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    return { fixture, el, items };
  };

  it('offers device, light and dark with icons, the device one picked at first', async () => {
    const { el, items } = await setup();
    expect(el.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Tema');
    expect(items().map((i) => i.textContent?.trim())).toEqual(['Sistema', 'Claro', 'Oscuro']);
    expect(items().map((i) => i.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(items().every((i) => i.querySelector('app-icon svg'))).toBe(true);
  });

  it('switches the theme and marks the choice', async () => {
    const { fixture, items } = await setup();
    items()[2].click();
    await fixture.whenStable();
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(items().map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(items()[2].classList).toContain('selected');
  });

  it('is translated', async () => {
    await TestBed.inject(I18n).use('pt-BR');
    const { items } = await setup();
    expect(items().map((i) => i.textContent?.trim())).toEqual(['Sistema', 'Claro', 'Escuro']);
  });
});
