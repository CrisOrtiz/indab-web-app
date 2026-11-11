import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Evaluation } from '../../core/models/evaluation';
import { EvaluationBriefing } from './evaluation-briefing';

const evaluation = (extra: Partial<Evaluation> = {}) =>
  ({
    id: 'e1',
    title: 'Final de oro',
    description: 'Opera solo con tu plan.',
    symbol: 'XAUUSDT',
    replayStart: 0,
    hideDates: true,
    startingBalance: 200,
    durationMinutes: 30,
    pace: 60,
    ...extra,
  }) as Evaluation;

describe('EvaluationBriefing', () => {
  const render = async (ev: Evaluation) => {
    const fixture = TestBed.createComponent(EvaluationBriefing);
    fixture.componentRef.setInput('evaluation', ev);
    const started = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.started.subscribe(started);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const button = (name: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
    return { fixture, el, started, cancelled, button };
  };

  it('explains the attempt and its grading, and starts once read', async () => {
    const { fixture, el, started, button } = await render(evaluation());
    const text = el.textContent!;
    expect(el.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(text).toContain('Antes de empezar: Final de oro');
    expect(text).toContain('Opera solo con tu plan.');
    expect(text).toContain('Tienes un solo intento de 30 minutos');
    // 30 minutes at one market minute a second: 30 hours of market.
    expect(text).toContain('1 min de mercado por segundo');
    expect(text).toContain('1 d 6 h');
    expect(text).toContain('Empiezas con 200 USD y apalancamiento 1:200');
    expect(text).toContain('No verás la fecha del gráfico');
    expect(text).toContain('5 minutos y 1 minuto');
    expect(text).toContain('25\u00a0% rúbrica de tu mentor y 10\u00a0% bitácora');
    expect(text).toContain('Apruebas con 70.');
    expect(text).toContain('Escribe en la bitácora por qué entraste');

    expect(button('Empezar ahora').disabled).toBe(true);
    el.querySelector<HTMLInputElement>('.read input')!.click();
    await fixture.whenStable();
    button('Empezar ahora').click();
    expect(started).toHaveBeenCalledTimes(1);
  });

  it("tells the evaluation's own passing score", async () => {
    const { el } = await render(evaluation({ passingScore: 60 }));
    expect(el.textContent).toContain('Apruebas con 60.');
  });

  it('says when the student picks the speed, and can be put off', async () => {
    const { el, cancelled, button } = await render(
      evaluation({ pace: undefined, hideDates: false, description: '' }),
    );
    expect(el.textContent).toContain('Eliges la velocidad del replay');
    expect(el.textContent).not.toContain('No verás la fecha');
    button('Ahora no').click();
    el.querySelector<HTMLElement>('[role="dialog"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    expect(cancelled).toHaveBeenCalledTimes(2);
  });
});
