import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EvaluationStanding } from '../../ranking/standings';
import { EvaluationResults, RESULTS_PAGE_SIZE } from './evaluation-results';

const standing = (i: number, status: EvaluationStanding['status']): EvaluationStanding => ({
  rank: status === 'notStarted' ? null : i + 1,
  uid: `u${i}`,
  name: `Alumno ${String(i + 1).padStart(2, '0')}`,
  status,
  balance: status === 'notStarted' ? null : 200 + i,
  pnl: status === 'notStarted' ? null : 30 - i,
  return: status === 'notStarted' ? null : 0.1,
  trades: status === 'notStarted' ? null : 2,
});

describe('EvaluationResults', () => {
  let fixture: ComponentFixture<EvaluationResults>;
  let el: HTMLElement;

  const render = async (standings: EvaluationStanding[]) => {
    fixture = TestBed.createComponent(EvaluationResults);
    fixture.componentRef.setInput('standings', standings);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };
  const rows = () => [...el.querySelectorAll('tbody tr')];
  const field = (label: string) =>
    [...el.querySelectorAll('.list-filters label')]
      .find((l) => l.textContent?.trim().startsWith(label))!
      .querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
  const pagerButton = (name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('.pager button')].find(
      (b) => b.textContent?.trim() === name,
    )!;

  it('pages a long ranking', async () => {
    await render(
      Array.from({ length: 45 }, (_, i) => standing(i, i < 40 ? 'finished' : 'notStarted')),
    );
    expect(rows()).toHaveLength(RESULTS_PAGE_SIZE);
    expect(el.querySelector('.pager')?.textContent).toContain('Página 1 de 3');
    expect(pagerButton('Anterior').disabled).toBe(true);

    pagerButton('Siguiente').click();
    await fixture.whenStable();
    expect(rows()[0].textContent).toContain('21');
    pagerButton('Siguiente').click();
    await fixture.whenStable();
    expect(rows()).toHaveLength(5);
    expect(pagerButton('Siguiente').disabled).toBe(true);
  });

  it('filters by name and status, keeping each place in the ranking', async () => {
    await render([standing(0, 'finished'), standing(1, 'active'), standing(2, 'notStarted')]);
    expect(el.querySelector('.pager')).toBeNull();

    const status = field('Estado');
    status.value = 'active';
    status.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector('td')?.textContent).toBe('2');

    status.value = '';
    status.dispatchEvent(new Event('change'));
    const search = field('Buscar estudiante') as HTMLInputElement;
    search.value = 'alumno 03';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Sin presentar');

    search.value = 'nadie';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.textContent).toContain('Nada coincide con estos filtros.');
  });

  it('says when nobody took the evaluation', async () => {
    await render([]);
    expect(el.textContent).toContain('Nadie ha presentado esta evaluación.');
  });
});
