import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { quietFeatureFlags } from '../../../core/features/testing';
import { AdminFeatures } from './admin-features';

describe('AdminFeatures', () => {
  const render = async (quiet = quietFeatureFlags({ ranking: 'off' })) => {
    TestBed.configureTestingModule({
      imports: [AdminFeatures],
      providers: [provideRouter([]), ...quiet.providers],
    });
    const fixture = TestBed.createComponent(AdminFeatures);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { el, quiet, stable: () => fixture.whenStable() };
  };
  const row = (el: HTMLElement, title: string) =>
    [...el.querySelectorAll('li.feature')].find(
      (li) => li.querySelector('h2')?.textContent === title,
    )!;
  const pressed = (li: Element) => li.querySelector('[aria-pressed="true"]')?.textContent?.trim();

  it('lists each feature with who sees it', async () => {
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent).toBe('Funciones');
    const titles = [...el.querySelectorAll('li.feature h2')].map((h) => h.textContent);
    expect(titles).toEqual([
      'Material de estudio',
      'Práctica de trading',
      'Exámenes',
      'Ranking',
      'Calendario económico',
      'Reseñas',
    ]);
    expect(pressed(row(el, 'Práctica de trading'))).toBe('Visible para todos');
    expect(pressed(row(el, 'Ranking'))).toBe('Oculto');
    expect(row(el, 'Ranking').querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Quién ve Ranking',
    );
  });

  it('saves a new mode at once and says so', async () => {
    const { el, quiet, stable } = await render();
    const setMode = vi.spyOn(quiet.service, 'setMode');
    const practice = row(el, 'Práctica de trading');
    const staffOnly = [...practice.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Solo staff',
    )!;
    staffOnly.click();
    await stable();
    expect(setMode).toHaveBeenCalledWith('practice', 'staff');
    expect(pressed(practice)).toBe('Solo staff');
    expect(el.querySelector('.message')?.textContent).toContain('Práctica de trading: solo staff.');
  });

  it('reports a failed save', async () => {
    const { el, quiet, stable } = await render();
    vi.spyOn(quiet.service, 'setMode').mockRejectedValue(new Error('denied'));
    const hide = [...row(el, 'Exámenes').querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Oculto',
    )!;
    hide.click();
    await stable();
    expect(el.querySelector('.message.error')?.textContent).toContain(
      'No se pudo guardar el cambio.',
    );
  });
});
