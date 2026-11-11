import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SavedRubricScores } from '../../../core/models/evaluation';
import { RubricForm } from './rubric-form';

describe('RubricForm', () => {
  const render = async (initial: SavedRubricScores | null, journaled = true) => {
    const fixture = TestBed.createComponent(RubricForm);
    fixture.componentRef.setInput('studentName', 'Ana');
    fixture.componentRef.setInput('initial', initial);
    fixture.componentRef.setInput('journaled', journaled);
    const saved = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const scales = () => [...el.querySelectorAll('.scale')];
    const checked = () =>
      scales().map(
        (scale) => scale.querySelector('[aria-checked="true"]')?.textContent?.trim() ?? null,
      );
    const pick = (scale: number, value: number) =>
      scales()[scale].querySelectorAll<HTMLButtonElement>('button')[value - 1].click();
    return { fixture, el, saved, cancelled, checked, pick };
  };

  it('starts from the saved rubric and saves the change', async () => {
    const { fixture, el, saved, checked, pick } = await render({
      plan: 4,
      context: 3,
      management: 5,
      emotions: 2,
      journal: 8,
    });
    expect(checked()).toEqual(['4', '3', '5', '2', '8']);
    // The journal is rated 1 to 10.
    expect(el.querySelectorAll('.scale.journal button')).toHaveLength(10);
    pick(1, 5);
    pick(4, 10);
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(saved).toHaveBeenCalledWith({
      plan: 4,
      context: 5,
      management: 5,
      emotions: 2,
      journal: 10,
    });
  });

  it('keeps only the criteria still asked from a rubric saved before', async () => {
    const { fixture, el, saved, checked, pick } = await render({
      plan: 4,
      risk: 3,
      stops: 5,
      context: 2,
      discipline: 4,
    });
    expect(checked()).toEqual(['4', '2', null, null, null]);
    expect(el.textContent).toContain('Control emocional');
    expect(el.textContent).not.toContain('Respeto de SL y TP');
    [2, 3, 4].forEach((i) => pick(i, 3));
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(saved).toHaveBeenCalledWith({
      plan: 4,
      context: 2,
      management: 3,
      emotions: 3,
      journal: 3,
    });
  });

  it('leaves the journal out when the student wrote none: it is 0 on its own', async () => {
    const { fixture, el, saved, checked, pick } = await render(null, false);
    expect(checked()).toEqual([null, null, null, null]);
    expect(el.textContent).toContain('No escribió bitácora: esta parte queda en 0.');
    [0, 1, 2, 3].forEach((i) => pick(i, 4));
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(saved).toHaveBeenCalledWith({ plan: 4, context: 4, management: 4, emotions: 4 });
  });

  it('asks for every criterion and can be cancelled', async () => {
    const { fixture, el, saved, cancelled, checked, pick } = await render(null);
    expect(checked()).toEqual([null, null, null, null, null]);
    expect(el.textContent).toContain('Calidad de la bitácora');
    [0, 1, 2, 3].forEach((i) => pick(i, 4));
    await fixture.whenStable();
    // The journal's score is missing.
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Elige una nota');
    expect(saved).not.toHaveBeenCalled();
    [...el.querySelectorAll<HTMLButtonElement>('.adjust-actions button')].at(-1)!.click();
    expect(cancelled).toHaveBeenCalled();
  });
});
