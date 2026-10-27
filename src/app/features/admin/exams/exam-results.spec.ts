import { signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { EvaluationService } from '../../evaluations/evaluation.service';
import { ExamService } from '../../exams/exam.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { ExamResults, resultState } from './exam-results';
import { quietNotifications } from '../../notifications/testing';

const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const exam = {
  id: 'x1',
  title: 'Fundamentos de trading',
  description: '',
  totalPoints: 100,
  passingPoints: 70,
  durationMinutes: 30,
  maxAttempts: 1,
  audience: 'selected',
  // Eva is assigned through her mentorship.
  studentIds: ['jose', 'luis'],
  mentorshipIds: ['m1'],
  opensAt: at(Date.now() - 3_600_000),
  closesAt: at(Date.now() + 3_600_000),
  questions: [
    {
      id: 'q1',
      type: 'single',
      text: '¿RSI?',
      imageUrl: '',
      options: ['Sobrecompra', 'Sobreventa'],
      points: 60,
      partial: false,
    },
    {
      id: 'q2',
      type: 'open',
      text: '¿Stop?',
      imageUrl: '',
      options: [],
      points: 40,
      partial: false,
    },
  ],
  published: true,
  resultsPublished: false,
  showAnswers: false,
};
const submission = (uid: string, extra: object = {}) => ({
  id: `x1_${uid}_1`,
  examId: 'x1',
  uid,
  userName: uid,
  attempt: 1,
  status: 'submitted',
  answers: { q1: { choices: [0], text: '' }, q2: { choices: [], text: 'Bajo el mínimo' } },
  startedAt: at(Date.now() - 600_000),
  submittedAt: at(Date.now() - 60_000),
  ...extra,
});

describe('ExamResults', () => {
  const quiet = quietNotifications();
  quiet.notifications.notifyStudents = vi.fn(async (..._args: unknown[]) => 0);
  let fixture: ComponentFixture<ExamResults>;
  let el: HTMLElement;
  const service = {
    get: vi.fn(async () => exam),
    key: vi.fn(async () => ({ answers: { q1: [0] } })),
    submissions: vi.fn(),
    grades: vi.fn(),
    saveGrade: vi.fn(async () => undefined),
    setResults: vi.fn(async () => undefined),
  };
  const evaluations = {
    students: vi.fn(async () => [
      { uid: 'jose', name: 'José Pérez', email: '', academy: true, mentorshipIds: [] },
      { uid: 'luis', name: 'Luis Díaz', email: '', academy: true, mentorshipIds: ['m2'] },
      { uid: 'eva', name: 'Eva Ruiz', email: '', academy: true, mentorshipIds: ['m1'] },
    ]),
  };
  const mentorships = {
    all: vi.fn(async () => [
      { id: 'm1', name: 'Grupo oro', active: true },
      { id: 'm2', name: 'Grupo índices', active: true },
    ]),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    service.submissions.mockResolvedValue([
      submission('jose'),
      submission('luis', { status: 'inProgress', startedAt: at(Date.now() - 60_000) }),
    ]);
    service.grades.mockResolvedValue([]);
    TestBed.configureTestingModule({
      imports: [ExamResults],
      providers: [
        ...quiet.providers,
        provideRouter([]),
        { provide: ExamService, useValue: service },
        {
          provide: AuthService,
          useValue: {
            user: signal({ uid: 'coach' }),
            isStaff: signal(true),
            isAdmin: signal(true),
          },
        },
        { provide: EvaluationService, useValue: evaluations },
        { provide: MentorshipService, useValue: mentorships },
      ],
    });
    fixture = TestBed.createComponent(ExamResults);
    fixture.componentRef.setInput('id', 'x1');
    el = fixture.nativeElement;
    await fixture.whenStable();
    await fixture.whenStable();
  });

  const rowOf = (name: string) =>
    [...el.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(name))!;
  const byLabel = <T extends HTMLElement>(label: string) =>
    el.querySelector<T>(`[aria-label="${label}"]`)!;

  it('lists every assigned student with the state of their attempt', () => {
    expect(service.get).toHaveBeenCalledWith('x1');
    expect(rowOf('José Pérez').textContent).toContain('Por calificar');
    expect(rowOf('Luis Díaz').textContent).toContain('Respondiendo');
    expect(rowOf('Eva Ruiz').textContent).toContain('Sin presentar');
    expect(el.querySelector('.stat strong')?.textContent).toBe('1');
  });

  it('filters the attempts by mentorship', async () => {
    const select = [...el.querySelectorAll('.list-filters label')]
      .find((l) => l.textContent?.trim().startsWith('Mentoría'))!
      .querySelector('select')!;
    select.value = 'm2';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const names = () => [...el.querySelectorAll('tbody td.name')].map((td) => td.textContent);
    expect(names()).toEqual(['Luis Díaz']);
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(names()).toHaveLength(3);
  });

  it('filters the attempts by name and state', async () => {
    const field = (label: string) =>
      [...el.querySelectorAll('.list-filters label')]
        .find((l) => l.textContent?.trim().startsWith(label))!
        .querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
    const names = () => [...el.querySelectorAll('tbody td.name')].map((td) => td.textContent);
    const search = field('Buscar estudiante') as HTMLInputElement;
    search.value = 'lu';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names()).toEqual(['Luis Díaz']);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const state = field('Estado');
    state.value = 'notStarted';
    state.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(names()).toEqual(['Eva Ruiz']);

    state.value = 'graded';
    state.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(el.textContent).toContain('Nada coincide con estos filtros.');
    // Stats still count every attempt; one page needs no pager.
    expect(el.querySelector('.stat strong')?.textContent).toBe('1');
    expect(el.querySelector('.pager')).toBeNull();
  });

  it('suggests points for closed questions and saves the grade', async () => {
    byLabel<HTMLButtonElement>('Calificar a José Pérez, intento 1').click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Sugerido: 60 de 60');
    expect(el.textContent).toContain('Por revisar');
    expect(el.textContent).toContain('Bajo el mínimo');

    // The open question needs its points first.
    el.querySelector('form.grading')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(el.querySelector('.message')?.textContent).toContain(
      'Los puntos de la pregunta 2 deben estar entre 0 y 40.',
    );

    const inputs = el.querySelectorAll<HTMLInputElement>('.score-row input[type=number]');
    inputs[1].value = '25';
    inputs[1].dispatchEvent(new Event('input'));
    const comments = el.querySelectorAll<HTMLInputElement>('.score-row input[type=text]');
    comments[1].value = ' Bien ';
    comments[1].dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('.total')?.textContent).toContain('Total: 85 de 100 · Aprobado');
    el.querySelector('form.grading')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(service.saveGrade).toHaveBeenCalledWith({
      examId: 'x1',
      uid: 'jose',
      attempt: 1,
      scores: { q1: 60, q2: 25 },
      comments: { q2: 'Bien' },
      feedback: '',
      total: 85,
      passed: true,
    });
    expect(rowOf('José Pérez').textContent).toContain('85 / 100');
    expect(rowOf('José Pérez').textContent).toContain('Calificado');
  });

  it('publishes the results and the right answers', async () => {
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Publicar resultados')!
      .click();
    await fixture.whenStable();
    expect(service.setResults).toHaveBeenCalledWith('x1', {
      resultsPublished: true,
      showAnswers: false,
    });
    // Those who took it hear the results are out.
    expect(quiet.notifications.notifyStudents).toHaveBeenCalledWith(
      'results',
      'exam',
      expect.objectContaining({ id: 'x1' }),
      ['jose', 'luis'],
    );
    el.querySelector<HTMLInputElement>('.publish input')!.click();
    await fixture.whenStable();
    expect(service.setResults).toHaveBeenLastCalledWith('x1', {
      resultsPublished: true,
      showAnswers: true,
    });
  });

  it('opens the attempt a notification points to, with the mentor notes', async () => {
    fixture.componentRef.setInput('submission', 'x1_jose_1');
    fixture.componentRef.setInput('id', 'x2');
    await fixture.whenStable();
    await fixture.whenStable();
    expect(el.querySelector('.grading h2')?.textContent).toContain('José Pérez');
    expect(el.querySelector('app-mentor-notes')?.textContent).toContain('Notas del mentor');
  });

  it('marks unfinished attempts whose time ran out', () => {
    const s = submission('luis', { status: 'inProgress', startedAt: at(0) });
    expect(resultState(exam as never, s as never, null, 40 * 60_000)).toBe('expired');
    expect(resultState(exam as never, s as never, null, 10 * 60_000)).toBe('inProgress');
  });
});
