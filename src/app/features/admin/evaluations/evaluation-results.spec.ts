import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PracticeTrade } from '../../../core/models/practice';
import { sessionStats } from '../../practice/stats';
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
  sessionId: status === 'notStarted' ? null : `s${i}`,
  open: status === 'active',
  extraMinutes: 0,
  stats: null,
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

  it('offers extra time only on open attempts and a restart on any taken one', async () => {
    await render([
      { ...standing(0, 'active'), extraMinutes: 15 },
      standing(1, 'finished'),
      standing(2, 'notStarted'),
    ]);
    expect(rows()[0].textContent).toContain('+15 min');
    const menus = rows().map((r) => r.querySelector('app-actions-menu'));
    expect(menus[0]).not.toBeNull();
    expect(menus[1]).not.toBeNull();
    expect(menus[2]).toBeNull();
  });

  it("switches to each attempt's risk metrics", async () => {
    const closed = (pnl: number, stopLoss: number | null, exitReason = 'manual') =>
      ({
        status: 'closed',
        side: 'long',
        entryPrice: 100,
        entryTime: 0,
        quantity: 2,
        stopLoss,
        takeProfit: stopLoss === null ? null : 110,
        exitTime: 1,
        exitReason,
        pnl,
      }) as PracticeTrade;
    await render([
      {
        ...standing(0, 'finished'),
        stats: sessionStats([closed(20, 95), closed(-10, null, 'stopOut')], 200),
      },
      standing(1, 'notStarted'),
    ]);
    expect(el.querySelector('thead')?.textContent).toContain('Ganancia / pérdida');
    [...el.querySelectorAll<HTMLButtonElement>('.result-views button')]
      .find((b) => b.textContent?.trim() === 'Métricas de riesgo')!
      .click();
    await fixture.whenStable();
    const head = el.querySelector('thead')!.textContent!;
    expect(head).toContain('Riesgo por operación');
    expect(head).not.toContain('Ganancia / pérdida');
    const cells = [...rows()[0].querySelectorAll('td')].map((td) => td.textContent?.trim());
    // Risk: 5 USD a unit x 2 units over 200 = 5 %; R:R 10 / 5 = 2.
    expect(cells).toContain('1:2');
    expect(cells.some((c) => c?.startsWith('5.0%'))).toBe(true);
    expect(cells).toContain('Sí');
    expect(rows()[1].textContent).toContain('—');
  });

  it('says when nobody took the evaluation', async () => {
    await render([]);
    expect(el.textContent).toContain('Nadie ha presentado esta evaluación.');
  });
});
