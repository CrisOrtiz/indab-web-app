import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { ExamService } from './exam.service';
import { ExamTake, clock } from './exam-take';
import { quietNotifications } from '../notifications/testing';

const hour = 3_600_000;
const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const exam = (extra: object = {}) => ({
  id: 'x1',
  title: 'Fundamentos de trading',
  description: 'Con calma',
  totalPoints: 100,
  passingPoints: 70,
  durationMinutes: 30,
  maxAttempts: 2,
  audience: 'all',
  studentIds: [],
  opensAt: at(Date.now() - hour),
  closesAt: at(Date.now() + hour),
  questions: [
    {
      id: 'q1',
      type: 'multiple',
      text: '¿Alcistas?',
      imageUrl: '',
      options: ['Martillo', 'Estrella'],
      points: 60,
      partial: true,
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
  ...extra,
});
const attempt = (extra: object = {}) => ({
  id: 'x1_jose_1',
  examId: 'x1',
  uid: 'jose',
  attempt: 1,
  status: 'inProgress',
  answers: {},
  startedAt: at(Date.now()),
  submittedAt: null,
  ...extra,
});

describe('ExamTake', () => {
  const quiet = quietNotifications();
  quiet.notifications.notifyActivity = vi.fn(async (..._args: unknown[]) => 0);
  let fixture: ComponentFixture<ExamTake>;
  let el: HTMLElement;
  const service = {
    get: vi.fn(),
    mySubmissions: vi.fn(),
    myGrades: vi.fn(async () => []),
    key: vi.fn(async () => ({ answers: { q1: [0] } })),
    start: vi.fn(async () => 'x1_jose_1'),
    getSubmission: vi.fn(async () => attempt()),
    saveAnswers: vi.fn(async () => undefined),
    submit: vi.fn(async () => undefined),
  };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [ExamTake],
      providers: [
        ...quiet.providers,
        provideRouter([]),
        { provide: ExamService, useValue: service },
        {
          provide: AuthService,
          useValue: {
            user: signal({ uid: 'jose' }),
            isStaff: signal(false),
            isAdmin: signal(false),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ExamTake);
    fixture.componentRef.setInput('id', 'x1');
    el = fixture.nativeElement;
    await fixture.whenStable();
    await fixture.whenStable();
  };
  const button = (text: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    service.get.mockResolvedValue(exam());
    service.mySubmissions.mockResolvedValue([]);
  });

  it('formats the countdown', () => {
    expect(clock(29 * 60_000 + 5_000)).toBe('29:05');
    expect(clock(3_725_000)).toBe('1:02:05');
    expect(clock(-5)).toBe('00:00');
  });

  it('starts an attempt and hands in the answers', async () => {
    await render();
    expect(el.textContent).toContain('100 puntos · apruebas con 70 · 2 preguntas');
    button('Comenzar intento 1').click();
    await fixture.whenStable();
    expect(service.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'x1' }), 1);
    expect(el.querySelector('.timer')?.textContent).toMatch(/Quedan (29:5\d|30:0\d)/);
    expect(el.textContent).toContain('Pregunta 1 de 2');

    const boxes = el.querySelectorAll<HTMLInputElement>('.choice input');
    expect(boxes[0].type).toBe('checkbox');
    boxes[0].click();
    boxes[1].click();
    await fixture.whenStable();
    button('Siguiente').click();
    await fixture.whenStable();
    expect(service.saveAnswers).toHaveBeenCalledWith('x1_jose_1', {
      q1: { choices: [0, 1], text: '' },
    });
    const text = el.querySelector<HTMLTextAreaElement>('.open textarea')!;
    text.value = 'Bajo el mínimo';
    text.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    button('Entregar').click();
    await fixture.whenStable();
    expect(service.submit).toHaveBeenCalledWith('x1_jose_1', {
      q1: { choices: [0, 1], text: '' },
      q2: { choices: [], text: 'Bajo el mínimo' },
    });
    expect(el.textContent).toContain('¡Entregado!');
    expect(quiet.notifications.notifyActivity).toHaveBeenCalledWith({
      type: 'examSubmitted',
      kind: 'exam',
      refId: 'x1_jose_1',
      contextId: 'x1',
      title: expect.any(String),
    });
    expect(button('Comenzar intento 2')).toBeTruthy();
  });

  it('continues an attempt in progress with its saved answers', async () => {
    service.mySubmissions.mockResolvedValue([
      attempt({ answers: { q1: { choices: [1], text: '' } } }),
    ]);
    await render();
    button('Continuar intento 1').click();
    await fixture.whenStable();
    const boxes = el.querySelectorAll<HTMLInputElement>('.choice input');
    expect(boxes[1].checked).toBe(true);
    expect(service.start).not.toHaveBeenCalled();
  });

  it('shows the published grade with comments and the right answers', async () => {
    service.get.mockResolvedValue(exam({ resultsPublished: true, showAnswers: true }));
    service.mySubmissions.mockResolvedValue([
      attempt({ status: 'submitted', answers: { q1: { choices: [1], text: '' } } }),
    ]);
    service.myGrades.mockResolvedValue([
      {
        id: 'x1_jose_1',
        examId: 'x1',
        attempt: 1,
        scores: { q1: 0, q2: 40 },
        comments: { q1: 'Repasa' },
        feedback: 'Bien',
        total: 40,
        passed: false,
      },
    ] as never);
    await render();
    expect(el.querySelector('.best')?.textContent).toContain('40 / 100');
    expect(el.querySelector('.best')?.textContent).toContain('Reprobado');
    button('Revisión del intento 1').click();
    await fixture.whenStable();
    const review = el.querySelector('.review')!.textContent!;
    expect(review).toContain('Bien');
    expect(review).toContain('Repasa');
    expect(review).toContain('Respuesta correcta');
    expect(review).toContain('0 de 60 puntos');
  });

  it('tells a student when the form is not theirs', async () => {
    service.get.mockRejectedValue(new Error('permission-denied'));
    await render();
    expect(el.textContent).toContain('Este examen no existe o no está asignado a ti.');
  });
});
