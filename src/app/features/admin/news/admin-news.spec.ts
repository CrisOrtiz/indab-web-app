import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { NewsEvent } from '../../../core/models/market-news';
import { NewsService } from '../../practice/news.service';
import { AdminNews, shiftMonth } from './admin-news';

const nfp: NewsEvent = {
  id: 'official-nfp-2026-11-06',
  time: Date.parse('2026-11-06T13:30:00Z') / 1000,
  name: 'Non-Farm Payrolls',
  country: 'US',
  impact: 'high',
  actual: null,
  forecast: '120K',
  previous: '254K',
};

describe('shiftMonth', () => {
  it('moves across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('AdminNews', () => {
  const render = async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    const service = {
      list: vi.fn(async (month: string) => (month === '2026-11' ? [nfp] : [])),
      save: vi.fn(async () => 'new1'),
      remove: vi.fn(async () => undefined),
      importMissing: vi.fn(async (items: unknown[]) => items.length),
    };
    TestBed.configureTestingModule({
      imports: [AdminNews],
      providers: [
        provideRouter([]),
        { provide: NewsService, useValue: service },
        { provide: AuthService, useValue: { user: signal({ uid: 'trainer' }) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminNews);
    vi.useRealTimers();
    // The month loads asynchronously (through the loading service).
    const settle = async () => {
      for (let i = 0; i < 3; i++) {
        await fixture.whenStable();
        await new Promise((resolve) => setTimeout(resolve));
      }
      await fixture.whenStable();
    };
    await settle();
    const el: HTMLElement = fixture.nativeElement;
    const button = (name: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
    const field = (label: string) =>
      [...el.querySelectorAll('label')]
        .find((l) => l.textContent?.trim().startsWith(label))!
        .querySelector<HTMLInputElement & HTMLSelectElement>('input, select')!;
    const type = (label: string, value: string) => {
      const input = field(label);
      input.value = value;
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    };
    return { fixture: { whenStable: settle }, el, service, button, type };
  };

  it("lists this month's releases with their figures, and moves between months", async () => {
    const { fixture, el, service } = await render();
    expect(service.list).toHaveBeenCalledWith('2026-11');
    expect(el.textContent).toContain('Non-Farm Payrolls');
    expect(el.textContent).toContain('vie 6 nov, 13:30');
    expect(el.textContent).toContain('Previsión: 120K');
    expect(el.textContent).toContain('1 noticia');

    el.querySelector<HTMLButtonElement>('[aria-label="Mes anterior"]')!.click();
    await fixture.whenStable();
    expect(service.list).toHaveBeenLastCalledWith('2026-10');
    expect(el.textContent).toContain('No hay noticias en este mes.');
  });

  it('adds a release in the staff time zone, trimmed', async () => {
    const { fixture, el, service, button, type } = await render();
    button('Agregar noticia').click();
    await fixture.whenStable();
    type('Nombre', '  CPI  ');
    type('Fecha y hora', '2026-11-10T09:30');
    type('Impacto', 'medium');
    type('Previsión', '0.3%');
    button('Guardar').click();
    await fixture.whenStable();
    expect(service.save).toHaveBeenCalledWith(
      {
        time: Date.parse('2026-11-10T09:30:00Z') / 1000,
        name: 'CPI',
        country: 'US',
        impact: 'medium',
        actual: null,
        forecast: '0.3%',
        previous: null,
      },
      undefined,
    );
    expect(el.textContent).toContain('Noticia guardada.');
  });

  it('refuses a release without a name', async () => {
    const { fixture, el, service, button } = await render();
    button('Agregar noticia').click();
    await fixture.whenStable();
    // Past the browser's own `required` check.
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(service.save).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Revisa el nombre');
  });

  it('edits and deletes a release from its menu', async () => {
    const { fixture, el, service, button, type } = await render();
    el.querySelector<HTMLButtonElement>('app-actions-menu button')!.click();
    await fixture.whenStable();
    [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((b) => b.textContent?.includes('Editar'))!
      .click();
    await fixture.whenStable();
    type('Actual', '119K');
    button('Guardar').click();
    await fixture.whenStable();
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({ actual: '119K', forecast: '120K', time: nfp.time }),
      nfp.id,
    );

    el.querySelector<HTMLButtonElement>('app-actions-menu button')!.click();
    await fixture.whenStable();
    [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((b) => b.textContent?.includes('Borrar'))!
      .click();
    await fixture.whenStable();
    expect(el.textContent).toContain('¿Borrar «Non-Farm Payrolls»?');
    el.querySelector<HTMLButtonElement>('.confirm .danger')!.click();
    await fixture.whenStable();
    expect(service.remove).toHaveBeenCalledWith(nfp.id);
    expect(el.textContent).toContain('Noticia borrada.');
  });

  it('loads the official schedules, only what is missing', async () => {
    const { fixture, el, service, button } = await render();
    button('Cargar fechas oficiales 2026').click();
    await fixture.whenStable();
    const items = service.importMissing.mock.calls[0][0] as { id: string }[];
    expect(items.some((i) => i.id === 'official-fomc-2026-12-09')).toBe(true);
    expect(el.textContent).toContain(`Se agregaron ${items.length} noticias.`);
  });
});
