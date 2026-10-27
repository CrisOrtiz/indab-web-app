import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { EvaluationService } from '../../evaluations/evaluation.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { PracticeService } from '../../practice/practice.service';
import { AdminEvaluations, toLocalInput } from './admin-evaluations';

const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const existing = {
  id: 'e1',
  title: 'Final de oro',
  description: 'Solo con stop loss',
  symbol: 'PAXGUSDT',
  replayStart: Date.UTC(2024, 2, 4, 8),
  hideDates: true,
  startingBalance: 200,
  durationMinutes: 45,
  opensAt: at(Date.now() - 3_600_000),
  closesAt: at(Date.now() + 3_600_000),
  studentIds: ['jose', 'luis'],
  // Ana joins through her (now inactive) mentorship.
  mentorshipIds: ['m2'],
  resultsPublished: false,
};

describe('AdminEvaluations', () => {
  let fixture: ComponentFixture<AdminEvaluations>;
  let el: HTMLElement;
  const service = {
    all: vi.fn(),
    students: vi.fn(),
    create: vi.fn(async () => 'new'),
    update: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    setResultsPublished: vi.fn(async () => undefined),
  };
  const practice = { evaluationSessions: vi.fn() };
  const mentorships = {
    all: vi.fn(async () => [
      { id: 'm1', name: 'Grupo oro', active: true },
      { id: 'm2', name: 'Grupo 2025', active: false },
    ]),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    service.all.mockResolvedValue([existing]);
    service.students.mockResolvedValue([
      { uid: 'jose', name: 'José Pérez', email: 'jose@x.co', academy: true, mentorshipIds: [] },
      {
        uid: 'luis',
        name: 'Luis Díaz',
        email: 'luis@x.co',
        academy: true,
        mentorshipIds: ['m1'],
      },
      {
        uid: 'ana',
        name: 'Ana Gómez',
        email: 'ana@x.co',
        academy: true,
        mentorshipIds: ['m1', 'm2'],
      },
      { uid: 'eva', name: 'Eva Ruiz', email: 'eva@x.co', academy: false, mentorshipIds: ['m1'] },
    ]);
    practice.evaluationSessions.mockResolvedValue([
      {
        uid: 'jose',
        userName: 'José Pérez',
        pnl: 12,
        balance: 212,
        startingBalance: 200,
        tradeCount: 3,
        status: 'finished',
      },
    ]);
    TestBed.configureTestingModule({
      imports: [AdminEvaluations],
      providers: [
        provideRouter([]),
        { provide: EvaluationService, useValue: service },
        { provide: PracticeService, useValue: practice },
        { provide: MentorshipService, useValue: mentorships },
      ],
    });
    fixture = TestBed.createComponent(AdminEvaluations);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  /** Clicks a button, opening the card's three-dot menu first when the action is in there. */
  const click = async (name: string) => {
    if (!button(name)) {
      el.querySelector<HTMLButtonElement>('.card-menu .trigger')!.click();
      await fixture.whenStable();
    }
    button(name)!.click();
    await fixture.whenStable();
  };
  const type = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  const message = () => el.querySelector('.message')?.textContent ?? '';

  it('lists evaluations with their window and students', () => {
    const card = el.querySelector('.card')!.textContent!;
    expect(card).toContain('Final de oro');
    expect(card).toContain('Abierta');
    expect(card).toContain('45 min');
    expect(card).toContain('3 estudiantes');
    expect(card).toContain('Mentorías: Grupo 2025');
  });

  it('creates an evaluation for the chosen students', async () => {
    await click('Nueva evaluación');
    // Only students with academy access can be assigned.
    expect(el.querySelector('.student-list')!.textContent).not.toContain('Eva Ruiz');
    await submit();
    expect(message()).toContain('Escribe un nombre');
    await type('input[type=text]', 'Semana 1');
    await submit();
    expect(message()).toContain('Asigna al menos un estudiante');
    el.querySelector<HTMLInputElement>('.student-list input')!.click();
    await fixture.whenStable();
    await submit();
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Semana 1',
        symbol: 'XAUUSDT',
        durationMinutes: 60,
        hideDates: true,
        startingBalance: 200,
        studentIds: ['jose'],
        resultsPublished: false,
      }),
    );
    const [input] = service.create.mock.calls[0] as unknown as [
      { replayStart: number; opensAt: Date; closesAt: Date },
    ];
    expect(input.replayStart % (4 * 3_600_000)).toBe(0);
    expect(input.closesAt.getTime() - input.opensAt.getTime()).toBe(7 * 86_400_000);
    expect(message()).toContain('Se guardó la evaluación Semana 1.');
    expect(el.querySelector('form')).toBeNull();
  });

  it('assigns an evaluation to a whole mentorship', async () => {
    await click('Nueva evaluación');
    // Inactive mentorships are not offered for new evaluations.
    const groups = el.querySelector('.mentorship-list')!;
    expect(groups.textContent).toContain('Grupo oro');
    expect(groups.textContent).toContain('2 estudiantes');
    expect(groups.textContent).not.toContain('Grupo 2025');
    await type('input[type=text]', 'Semana 2');
    groups.querySelector<HTMLInputElement>('input')!.click();
    await fixture.whenStable();
    // Its students show as included, and each counts once in the total.
    const luis = [...el.querySelectorAll('.student-list label')].find((l) =>
      l.textContent?.includes('Luis Díaz'),
    )!;
    expect(luis.textContent).toContain('por Grupo oro');
    expect(luis.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    expect(el.textContent).toContain('En total: 2 estudiantes');
    await submit();
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Semana 2', studentIds: [], mentorshipIds: ['m1'] }),
    );
  });

  it('checks the time limit and window', async () => {
    await click('Nueva evaluación');
    await type('input[type=text]', 'Prueba');
    await type('input[type=number]', '2');
    await submit();
    expect(message()).toContain('entre 5 y 600 minutos');
    await type('input[type=number]', '30');
    const opens = el.querySelectorAll<HTMLInputElement>('input[type=datetime-local]')[0].value;
    await type('input[type=datetime-local]:last-of-type', opens);
    const closes = el.querySelectorAll<HTMLInputElement>('input[type=datetime-local]');
    closes[1].value = opens;
    closes[1].dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await submit();
    expect(message()).toContain('La fecha de cierre debe ser posterior');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('edits an evaluation keeping its replay start', async () => {
    await click('Editar');
    expect(el.querySelector<HTMLInputElement>('input[type=text]')!.value).toBe('Final de oro');
    expect(el.querySelector<HTMLInputElement>('input[type=date]')!.value).toBe('2024-03-04');
    await type('input[type=number]', '90');
    await submit();
    expect(service.update).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        durationMinutes: 90,
        replayStart: existing.replayStart,
        studentIds: ['jose', 'luis'],
        mentorshipIds: ['m2'],
      }),
    );
  });

  it('duplicates an evaluation with the same replay for other students', async () => {
    await click('Duplicar');
    expect(el.textContent).toContain('Duplicar evaluación');
    expect(el.querySelector<HTMLInputElement>('input[type=text]')!.value).toBe(
      'Final de oro (copia)',
    );
    expect(el.querySelector<HTMLInputElement>('input[type=date]')!.value).toBe('2024-03-04');
    expect(el.querySelectorAll('.student-list input:checked')).toHaveLength(0);
    await submit();
    expect(message()).toContain('Asigna al menos un estudiante');
    el.querySelectorAll<HTMLInputElement>('.student-list input')[1].click();
    await fixture.whenStable();
    await submit();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Final de oro (copia)',
        symbol: 'PAXGUSDT',
        replayStart: existing.replayStart,
        hideDates: true,
        durationMinutes: 45,
        studentIds: ['luis'],
        resultsPublished: false,
      }),
    );
    const [input] = service.create.mock.calls[0] as unknown as [{ opensAt: Date; closesAt: Date }];
    // The copy's window lasts at least a day from now.
    expect(input.closesAt.getTime() - input.opensAt.getTime()).toBe(86_400_000);
  });

  it('shows the results, with who has not taken it', async () => {
    await click('Ver resultados');
    expect(practice.evaluationSessions).toHaveBeenCalledWith('e1');
    const rows = [...el.querySelectorAll('.results tbody tr')].map((tr) => tr.textContent);
    expect(rows[0]).toContain('José Pérez');
    expect(rows[0]).toContain('12.00');
    expect(rows[0]).toContain('6.0%');
    expect(rows[1]).toContain('Sin presentar');
    expect(rows.slice(1).join()).toContain('Luis Díaz');
    expect(rows.slice(1).join()).toContain('Ana Gómez');
    // Filtering by mentorship keeps only its students.
    const filter = [...el.querySelectorAll<HTMLSelectElement>('.list-filters select')].find((s) =>
      s.textContent?.includes('Todas las mentorías'),
    )!;
    filter.value = 'm2';
    filter.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const names = [...el.querySelectorAll('.results tbody td.name')].map((td) => td.textContent);
    expect(names).toEqual(['Ana Gómez']);
  });

  it('opens the results a link names (mentor dashboard)', async () => {
    await TestBed.inject(Router).navigateByUrl('/?results=e1');
    fixture = TestBed.createComponent(AdminEvaluations);
    el = fixture.nativeElement;
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(practice.evaluationSessions).toHaveBeenCalledWith('e1');
    expect(el.querySelector('.results')?.textContent).toContain('José Pérez');
  });

  it('keeps the actions in a three-dot menu that follows each evaluation', async () => {
    const trigger = el.querySelector<HTMLButtonElement>('.card-menu .trigger')!;
    expect(trigger.getAttribute('aria-label')).toBe('Acciones: Final de oro');
    trigger.click();
    await fixture.whenStable();
    const labels = () =>
      [...el.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim());
    expect(labels()).toEqual([
      'Ver resultados',
      'Publicar resultados',
      'Editar',
      'Duplicar',
      'Eliminar',
    ]);
    // A click outside closes it.
    document.body.click();
    await fixture.whenStable();
    expect(el.querySelector('[role="menu"]')).toBeNull();
    await click('Ver resultados');
    trigger.click();
    await fixture.whenStable();
    expect(labels()[0]).toBe('Ocultar resultados');
  });

  it('publishes the results and deletes after confirming', async () => {
    await click('Publicar resultados');
    expect(service.setResultsPublished).toHaveBeenCalledWith('e1', true);
    expect(el.textContent).toContain('Resultados publicados');

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('Eliminar');
    expect(service.remove).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    await click('Eliminar');
    expect(service.remove).toHaveBeenCalledWith('e1');
    expect(el.textContent).toContain('Todavía no hay evaluaciones.');
  });

  it('formats dates for the datetime inputs', () => {
    expect(toLocalInput(new Date(2026, 9, 4, 7, 5))).toBe('2026-10-04T07:05');
  });
});
