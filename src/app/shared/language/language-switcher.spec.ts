import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
import { LanguageSwitcher } from './language-switcher';

describe('LanguageSwitcher', () => {
  beforeEach(() => localStorage.clear());

  it('lists the three languages and switches the site to the one picked', async () => {
    const fixture = TestBed.createComponent(LanguageSwitcher);
    await fixture.whenStable();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect([...select.options].map((o) => o.value)).toEqual(['es-419', 'en-US', 'pt-BR']);
    expect(select.value).toBe('es-419');
    expect(select.getAttribute('aria-label')).toBe('Idioma');

    select.value = 'en-US';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(TestBed.inject(I18n).language()).toBe('en-US'));
    await fixture.whenStable();
    expect(select.getAttribute('aria-label')).toBe('Language');
    expect(select.value).toBe('en-US');
  });
});
