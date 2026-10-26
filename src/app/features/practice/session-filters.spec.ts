import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionFilters } from './practice.service';
import { SessionFilterBar, dayStart } from './session-filters';

describe('SessionFilterBar', () => {
  let fixture: ComponentFixture<SessionFilterBar>;
  let el: HTMLElement;
  let emitted: SessionFilters[];

  const render = async (students: { uid: string; name: string }[] = []) => {
    fixture = TestBed.createComponent(SessionFilterBar);
    fixture.componentRef.setInput('students', students);
    fixture.componentRef.setInput('evaluations', [{ id: 'e1', title: 'Octubre' }]);
    emitted = [];
    fixture.componentInstance.filtersChange.subscribe((f) => emitted.push(f));
    el = fixture.nativeElement;
    await fixture.whenStable();
  };
  const field = (label: string) =>
    [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.trim().startsWith(label))
      ?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
  const change = async (label: string, value: string) => {
    const input = field(label)!;
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };

  it('hides the student filter on a student’s own list', async () => {
    await render();
    expect(field('Estudiante')).toBeUndefined();
    expect([...field('Tipo')!.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Todas',
      'Práctica libre',
      'Octubre',
    ]);
  });

  it('emits the filters as the service takes them, and clears them', async () => {
    await render([{ uid: 'ana', name: 'Ana' }]);
    await change('Estudiante', 'ana');
    await change('Tipo', 'free');
    await change('Estado', 'active');
    await change('Desde', '2026-10-01');
    await change('Hasta', '2026-10-31');
    expect(emitted.at(-1)).toEqual({
      uid: 'ana',
      evaluationId: null,
      status: 'active',
      from: new Date(2026, 9, 1),
      to: new Date(2026, 10, 1),
    });
    await change('Tipo', 'e1');
    expect(emitted.at(-1)?.evaluationId).toBe('e1');

    const clear = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Limpiar filtros',
    )!;
    clear.click();
    await fixture.whenStable();
    expect(emitted.at(-1)).toEqual({});
    expect(el.querySelector('button')).toBeNull();
  });

  it('reads date inputs as local days', () => {
    expect(dayStart('2026-02-28', 1)).toEqual(new Date(2026, 2, 1));
    expect(dayStart('')).toBeUndefined();
  });
});
