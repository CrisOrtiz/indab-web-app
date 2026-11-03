import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RubricScores } from '../../../core/models/evaluation';
import { RubricForm } from './rubric-form';

describe('RubricForm', () => {
  const render = async (initial: RubricScores | null) => {
    const fixture = TestBed.createComponent(RubricForm);
    fixture.componentRef.setInput('studentName', 'Ana');
    fixture.componentRef.setInput('initial', initial);
    const saved = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const checked = () =>
      [...el.querySelectorAll('.scale')].map(
        (scale) => scale.querySelector('[aria-checked="true"]')?.textContent?.trim() ?? null,
      );
    return { fixture, el, saved, cancelled, checked };
  };

  it('starts from the saved rubric and saves the change', async () => {
    const { fixture, el, saved, checked } = await render({
      plan: 4,
      risk: 3,
      stops: 5,
      context: 2,
      discipline: 4,
    });
    expect(checked()).toEqual(['4', '3', '5', '2', '4']);
    el.querySelectorAll('.scale')[1].querySelectorAll<HTMLButtonElement>('button')[4].click();
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(saved).toHaveBeenCalledWith({ plan: 4, risk: 5, stops: 5, context: 2, discipline: 4 });
  });

  it('asks for every criterion and can be cancelled', async () => {
    const { fixture, el, saved, cancelled, checked } = await render(null);
    expect(checked()).toEqual([null, null, null, null, null]);
    expect(el.textContent).toContain('Disciplina');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Elige una nota');
    expect(saved).not.toHaveBeenCalled();
    [...el.querySelectorAll<HTMLButtonElement>('.adjust-actions button')].at(-1)!.click();
    expect(cancelled).toHaveBeenCalled();
  });
});
