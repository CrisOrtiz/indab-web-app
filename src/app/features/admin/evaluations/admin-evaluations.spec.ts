import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { EvaluationService } from '../../evaluations/evaluation.service';
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

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    service.all.mockResolvedValue([existing]);
    service.students.mockResolvedValue([
      { uid: 'jose', name: 'José Pérez', email: 'jose@x.co', academy: true },
      { uid: 'luis', name: 'Luis Díaz', email: 'luis@x.co', academy: true },
      { uid: 'eva', name: 'Eva Ruiz', email: 'eva@x.co', academy: false },
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
      ],
    });
    fixture = TestBed.createComponent(AdminEvaluations);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  const click = async (name: string) => {
    button(name).click();
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
    expect(card).toContain('2 estudiantes');
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
      }),
    );
  });

  it('shows the results, with who has not taken it', async () => {
    await click('Ver resultados');
    expect(practice.evaluationSessions).toHaveBeenCalledWith('e1');
    const rows = [...el.querySelectorAll('.results tbody tr')].map((tr) => tr.textContent);
    expect(rows[0]).toContain('José Pérez');
    expect(rows[0]).toContain('12.00');
    expect(rows[0]).toContain('6.0%');
    expect(rows[1]).toContain('Luis Díaz');
    expect(rows[1]).toContain('Sin presentar');
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
