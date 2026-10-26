import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';
import { Calendar } from './calendar';
import { WIDGET_SCRIPT } from './widget';

describe('Calendar page', () => {
  let fixture: ComponentFixture<Calendar>;
  let el: HTMLElement;

  const widgetSettings = () => {
    const script = el.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SCRIPT}"]`);
    return script ? JSON.parse(script.textContent ?? '') : null;
  };
  const checkbox = (name: string) =>
    [...el.querySelectorAll('label.chip')]
      .find((label) => label.textContent?.trim() === name)!
      .querySelector('input')!;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Calendar], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(Calendar);
    el = fixture.nativeElement;
    await settle();
  });

  it('embeds the live calendar for the US and Japan, high impact, in Spanish', () => {
    expect(el.querySelector('h1')?.textContent).toContain('Calendario económico');
    expect(widgetSettings()).toMatchObject({
      locale: 'es',
      countryFilter: 'us,jp',
      importanceFilter: '1',
    });
    expect(el.querySelector('.tradingview-widget-copyright a')?.getAttribute('href')).toBe(
      'https://www.tradingview.com/',
    );
    expect(el.textContent).toContain('Decisión de tasas del Banco de Japón (BoJ)');
  });

  it('rebuilds the widget when the filters change', async () => {
    checkbox('China').click();
    checkbox('Japón').click();
    checkbox('Medio').click();
    await settle();
    expect(el.querySelectorAll('script').length).toBe(1);
    expect(widgetSettings()).toMatchObject({ countryFilter: 'us,cn', importanceFilter: '0,1' });
  });

  it('shows impact as ForexFactory folders and maps them to the widget’s bars', () => {
    const folders = [...el.querySelectorAll('label.impact svg.folder')].map((svg) =>
      svg.getAttribute('class'),
    );
    expect(folders).toEqual(['folder high', 'folder medium', 'folder low']);
    expect(el.querySelector('.legend')?.textContent).toContain('Alto: 3 barras');
    expect(el.querySelector('.legend')?.textContent).toContain('Bajo: 1 barra');
  });

  it('asks for an impact level when none is picked', async () => {
    checkbox('Alto').click();
    await settle();
    expect(widgetSettings()).toBeNull();
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'Elige al menos un nivel de impacto',
    );
  });

  it('links back to the academy only when opened from it', async () => {
    expect(el.querySelector('a.back')).toBeNull();
    fixture.componentRef.setInput('fromAcademy', true);
    await settle();
    expect(el.querySelector('a.back')?.getAttribute('href')).toBe('/academy');
  });

  it('asks for an economy when none is picked', async () => {
    checkbox('Estados Unidos').click();
    checkbox('Japón').click();
    await settle();
    expect(widgetSettings()).toBeNull();
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'Elige al menos una economía',
    );
  });

  it('follows the site language', async () => {
    await TestBed.inject(I18n).use('pt-BR', false);
    await settle();
    expect(el.querySelector('h1')?.textContent).toContain('Calendário econômico');
    expect(widgetSettings()?.locale).toBe('br');
  });
});
