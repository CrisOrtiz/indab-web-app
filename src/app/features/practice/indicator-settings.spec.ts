import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IndicatorSettings } from './indicator-settings';
import { IndicatorConfig, defaultConfig, findIndicator } from './indicators';

@Component({
  imports: [IndicatorSettings],
  template: `<app-indicator-settings
    [indicator]="indicator()"
    [config]="config()"
    (saved)="saved.push($event)"
    (closed)="closed = closed + 1"
  />`,
})
class Host {
  readonly indicator = signal(findIndicator('supertrend')!);
  readonly config = signal(defaultConfig(findIndicator('supertrend')!));
  readonly saved: IndicatorConfig[] = [];
  closed = 0;
}

describe('IndicatorSettings', () => {
  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const button = (name: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent!.trim() === name)!;
    const click = async (name: string) => {
      button(name).click();
      await fixture.whenStable();
    };
    const change = async (input: HTMLInputElement | HTMLSelectElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    return { fixture, el, host: fixture.componentInstance, button, click, change };
  };

  it('edits inputs, style and visibility in tabs, and saves them on OK', async () => {
    const { el, host, click, change } = await render();
    expect(el.querySelector('h2')!.textContent).toBe('SuperTrend 10 3');
    expect([...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent!.trim())).toEqual([
      'Entradas de datos',
      'Estilo',
      'Visibilidad',
    ]);
    const [length, factor] = el.querySelectorAll<HTMLInputElement>('input[type="number"]');
    await change(length, '7');
    // Out of bounds: kept at the most it allows.
    await change(factor, '50');
    const signals = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    signals.checked = false;
    signals.dispatchEvent(new Event('change'));
    expect(el.querySelector('h2')!.textContent).toBe('SuperTrend 7 20');

    await click('Estilo');
    expect(el.textContent).toContain('Tendencia alcista');
    await change(el.querySelector<HTMLInputElement>('input[type="color"]')!, '#00FF00');
    await change(el.querySelector('select')!, '4');

    await click('Visibilidad');
    const timeframes = el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect([...timeframes].map((t) => t.checked)).toEqual([true, true, true, true, true, true]);
    timeframes[0].checked = false;
    timeframes[0].dispatchEvent(new Event('change'));

    expect(host.saved).toEqual([]);
    await click('Aceptar');
    expect(host.saved).toEqual([
      {
        inputs: { atrLength: 7, factor: 20, signals: false },
        colors: { up: '#00ff00', down: '#f23645' },
        widths: { up: 4 },
        hidden: [60],
      },
    ]);
  });

  it('puts the defaults back, and closes without saving', async () => {
    const { el, host, click } = await render();
    host.config.set({
      ...defaultConfig(host.indicator()),
      inputs: { atrLength: 5, factor: 1, signals: true },
    });
    await click('Restablecer');
    await click('Aceptar');
    expect(host.saved.at(-1)).toEqual(defaultConfig(host.indicator()));

    await click('Cancelar');
    // A click on the backdrop lands on the dialog itself.
    el.querySelector('dialog')!.click();
    // Escape: the dialog's cancel.
    el.querySelector('dialog')!.dispatchEvent(new Event('cancel'));
    expect(host.closed).toBe(3);
    expect(host.saved).toHaveLength(1);
  });

  it('says when an indicator has nothing to set', async () => {
    const { el, host, fixture, click } = await render();
    host.indicator.set(findIndicator('volume')!);
    host.config.set(defaultConfig(findIndicator('volume')!));
    await fixture.whenStable();
    expect(el.querySelector('h2')!.textContent).toBe('Volumen');
    expect(el.textContent).toContain('Este indicador no tiene entradas.');
    await click('Estilo');
    expect(el.textContent).toContain('Las barras toman el color de su vela.');
  });

  it('moves between tabs with the arrow keys', async () => {
    const { el, fixture } = await render();
    const tabs = () => [...el.querySelectorAll<HTMLElement>('[role="tab"]')];
    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await fixture.whenStable();
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[2]);
  });
});
