import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { ExamService } from './exam.service';
import { Exams } from './exams';

const hour = 3_600_000;
const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const exam = (id: string, title: string, extra: object = {}) => ({
  id,
  title,
  totalPoints: 100,
  passingPoints: 70,
  durationMinutes: 30,
  maxAttempts: 1,
  opensAt: at(Date.now() - hour),
  closesAt: at(Date.now() + hour),
  questions: [],
  resultsPublished: false,
  ...extra,
});

describe('Exams', () => {
  let fixture: ComponentFixture<Exams>;
  let el: HTMLElement;
  const service = { assignedTo: vi.fn(), mySubmissions: vi.fn(), myGrades: vi.fn() };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [Exams],
      providers: [
        provideRouter([]),
        { provide: ExamService, useValue: service },
        {
          provide: AuthService,
          useValue: { user: signal({ uid: 'jose' }), profile: signal({ mentorshipIds: ['m1'] }) },
        },
      ],
    });
    fixture = TestBed.createComponent(Exams);
    el = fixture.nativeElement;
    await fixture.whenStable();
    await fixture.whenStable();
  };
  const column = (name: string) =>
    el.querySelector(`section[aria-label="${name}"]`)?.textContent ?? '';

  beforeEach(() => vi.clearAllMocks());

  it('sorts the forms into to do, upcoming and finished', async () => {
    service.assignedTo.mockResolvedValue([
      exam('open', 'Fundamentos'),
      exam('soon', 'Gestión de riesgo', {
        opensAt: at(Date.now() + hour),
        closesAt: at(Date.now() + 2 * hour),
      }),
      exam('done', 'Velas', { resultsPublished: true }),
      exam('review', 'Análisis técnico'),
    ]);
    const submitted = (examId: string) => ({
      id: `${examId}_jose_1`,
      examId,
      attempt: 1,
      status: 'submitted',
      startedAt: at(Date.now()),
    });
    service.mySubmissions.mockResolvedValue([submitted('done'), submitted('review')]);
    service.myGrades.mockResolvedValue([
      { id: 'done_jose_1', examId: 'done', attempt: 1, total: 85, passed: true },
    ]);
    await render();
    expect(service.assignedTo).toHaveBeenCalledWith('jose', ['m1']);

    expect(service.myGrades).toHaveBeenCalledWith([expect.objectContaining({ examId: 'done' })]);
    expect(column('Pendientes')).toContain('Fundamentos');
    expect(column('Pendientes')).toContain('Comenzar');
    expect(column('Próximos')).toContain('Gestión de riesgo');
    expect(column('Próximos')).toContain('Todavía no se puede abrir');
    expect(column('Terminados')).toContain('85 / 100 · Aprobado');
    expect(column('Terminados')).toContain('En revisión');
  });

  it('says so when nothing is assigned', async () => {
    service.assignedTo.mockResolvedValue([]);
    service.mySubmissions.mockResolvedValue([]);
    service.myGrades.mockResolvedValue([]);
    await render();
    expect(el.textContent).toContain('No tienes exámenes asignados por ahora.');
  });
});
