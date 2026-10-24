import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { EvaluationService } from '../evaluations/evaluation.service';
import { PracticeService } from '../practice/practice.service';
import { Ranking } from './ranking';

const session = (
  uid: string,
  userName: string,
  pnl: number,
  evaluationId: string | null = null,
) => ({
  id: `${uid}-${pnl}`,
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
  const practice = { freeSessions: vi.fn(), evaluationSessions: vi.fn() };
  const evaluations = { all: vi.fn(), assignedTo: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    isStaff.set(false);
    practice.freeSessions.mockResolvedValue([
      session('u1', 'Ana', 10),
      session('u2', 'Luis', 25),
      session('u1', 'Ana', 5),
    ]);
    practice.evaluationSessions.mockResolvedValue([
      session('u1', 'Ana', 40, 'e1'),
      session('u2', 'Luis', -20, 'e1'),
    ]);
    evaluations.assignedTo.mockResolvedValue([
      { id: 'e1', title: 'Final de oro', resultsPublished: true },
      { id: 'e2', title: 'Sin publicar', resultsPublished: false },
    ]);
    evaluations.all.mockResolvedValue([{ id: 'e2', title: 'Sin publicar' }]);
    TestBed.configureTestingModule({
      imports: [Ranking],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: 'u1' }), isStaff } },
        { provide: PracticeService, useValue: practice },
        { provide: EvaluationService, useValue: evaluations },
      ],
    });
    fixture = TestBed.createComponent(Ranking);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const rows = () =>
    [...el.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].slice(0, 3).map((td) => td.textContent!.trim()),
    );
  const click = async (name: string) => {
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!.click();
    await fixture.whenStable();
  };

  it('ranks free practice over the last 30 days and marks the student', () => {
    const since = practice.freeSessions.mock.calls[0][0] as Date;
    expect(Math.round((Date.now() - since.getTime()) / 86_400_000)).toBe(30);
    expect(rows()).toEqual([
      ['1', 'Luis', '25.00'],
      ['2', 'Ana Tú', '15.00'],
    ]);
    expect(el.querySelector('tr.me')?.textContent).toContain('Ana');
  });

  it('changes the period', async () => {
    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = '7';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const since = practice.freeSessions.mock.calls[1][0] as Date;
    expect(Math.round((Date.now() - since.getTime()) / 86_400_000)).toBe(7);
  });

  it('shows students the published evaluations they took part in', async () => {
    await click('Evaluaciones');
    expect(evaluations.assignedTo).toHaveBeenCalledWith('u1');
    const options = [...el.querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(options).toEqual(['Final de oro']);
    expect(practice.evaluationSessions).toHaveBeenCalledWith('e1');
    expect(rows()).toEqual([
      ['1', 'Ana Tú', '40.00'],
      ['2', 'Luis', '-20.00'],
    ]);
  });

  it('shows staff every evaluation', async () => {
    isStaff.set(true);
    await click('Evaluaciones');
    expect(evaluations.all).toHaveBeenCalled();
    expect(practice.evaluationSessions).toHaveBeenCalledWith('e2');
  });

  it('says when no results are published', async () => {
    evaluations.assignedTo.mockResolvedValue([]);
    await click('Evaluaciones');
    expect(el.textContent).toContain('Todavía no hay resultados de evaluaciones publicados.');
  });

  it('shows an error when the ranking cannot load', async () => {
    practice.freeSessions.mockRejectedValue(new Error('denied'));
    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = '365';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo cargar el ranking.',
    );
  });
});
