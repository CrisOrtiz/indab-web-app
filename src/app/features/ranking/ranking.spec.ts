import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { EvaluationService } from '../evaluations/evaluation.service';
import { PracticeService } from '../practice/practice.service';
import { Ranking } from './ranking';

const attempt = (uid: string, userName: string, pnl: number, evaluationId: string) => ({
  id: `${evaluationId}_${uid}`,
  uid,
  userName,
  pnl,
  balance: 200 + pnl,
  startingBalance: 200,
  tradeCount: 3,
  status: 'finished',
  evaluationId,
});

describe('Ranking page', () => {
  let fixture: ComponentFixture<Ranking>;
  let el: HTMLElement;
  const isStaff = signal(false);
  const practice = { evaluationSessions: vi.fn() };
  const evaluations = { all: vi.fn(), assignedTo: vi.fn(), myRubric: vi.fn(), grades: vi.fn() };

  const render = async () => {
    fixture = TestBed.createComponent(Ranking);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    isStaff.set(false);
    practice.evaluationSessions.mockImplementation(async (id: string) =>
      id === 'e1'
        ? [attempt('u2', 'Luis', -20, 'e1'), attempt('u1', 'Ana', 40, 'e1')]
        : [attempt('u2', 'Luis', 5, id)],
    );
    evaluations.assignedTo.mockResolvedValue([
      { id: 'e1', title: 'Final de oro', resultsPublished: true },
      { id: 'e2', title: 'Sin publicar', resultsPublished: false },
      { id: 'e3', title: 'Semana 2', resultsPublished: true },
    ]);
    evaluations.all.mockResolvedValue([{ id: 'e2', title: 'Sin publicar' }]);
    evaluations.myRubric.mockResolvedValue(null);
    evaluations.grades.mockResolvedValue(new Map());
    TestBed.configureTestingModule({
      imports: [Ranking],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: signal({ uid: 'u1' }),
            profile: signal({ mentorshipIds: ['m1'] }),
            isStaff,
          },
        },
        { provide: PracticeService, useValue: practice },
        { provide: EvaluationService, useValue: evaluations },
      ],
    });
  });

  const rows = () =>
    [...el.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].slice(0, 3).map((td) => td.textContent!.trim()),
    );

  it('shows students the published evaluations they took part in, and marks them', async () => {
    await render();
    expect(evaluations.assignedTo).toHaveBeenCalledWith('u1', ['m1']);
    const options = [...el.querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(options).toEqual(['Final de oro', 'Semana 2']);
    expect(rows()).toEqual([
      ['1', 'Ana Tú', '40.00'],
      ['2', 'Luis', '-20.00'],
    ]);
    expect(el.querySelector('tr.me')?.textContent).toContain('Ana');
  });

  it('switches evaluation', async () => {
    await render();
    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = 'e3';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(practice.evaluationSessions).toHaveBeenLastCalledWith('e3');
    expect(rows()).toEqual([['1', 'Luis', '5.00']]);
  });

  it('shows staff every evaluation', async () => {
    isStaff.set(true);
    await render();
    expect(evaluations.all).toHaveBeenCalled();
    expect(practice.evaluationSessions).toHaveBeenCalledWith('e2');
    expect(evaluations.myRubric).not.toHaveBeenCalled();
  });

  it('ranks by the INDAB scores staff saved, when there are any', async () => {
    evaluations.grades.mockImplementation(async (id: string) =>
      id === 'e1'
        ? new Map([['u2', { score: 81.5, parts: { return: 40, risk: 100, rubric: 100 } }]])
        : new Map(),
    );
    await render();
    expect(el.querySelector('thead')?.textContent).toContain('Nota INDAB');
    expect(el.textContent).toContain('40 % rentabilidad');
    expect(el.textContent).not.toContain('ordenado por ganancia');
    expect(rows()).toEqual([
      ['1', 'Luis', '81.5'],
      ['2', 'Ana Tú', 'Falta rúbrica'],
    ]);

    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = 'e3';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.querySelector('thead')?.textContent).not.toContain('Nota INDAB');
  });

  it("shows the student's own rubric from the mentor", async () => {
    evaluations.myRubric.mockImplementation(async (id: string) =>
      id === 'e1'
        ? {
            uid: 'u1',
            scores: { plan: 4, risk: 3, stops: 5, context: 2, discipline: 4 },
            byName: 'Tomás',
          }
        : null,
    );
    await render();
    expect(evaluations.myRubric).toHaveBeenCalledWith('e1', 'u1');
    const rubric = el.querySelector('.rubric')!;
    expect(rubric.textContent).toContain('Rúbrica de tu mentor');
    expect(rubric.textContent).toContain('3.6 / 5');
    expect(rubric.textContent).toContain('Respeto de SL y TP');
    expect(rubric.textContent).toContain('Calificó Tomás');

    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = 'e3';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.querySelector('.rubric')).toBeNull();
  });

  it('says when no results are published', async () => {
    evaluations.assignedTo.mockResolvedValue([]);
    await render();
    expect(el.textContent).toContain('Todavía no hay resultados de evaluaciones publicados.');
  });

  it('shows an error when the ranking cannot load', async () => {
    evaluations.assignedTo.mockRejectedValue(new Error('denied'));
    await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo cargar el ranking.',
    );
  });
});
