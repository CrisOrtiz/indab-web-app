import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { EvaluationService } from '../../evaluations/evaluation.service';
import { ExamService } from '../../exams/exam.service';
import { AdminExams } from './admin-exams';

const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const existing = {
  id: 'x1',
  title: 'Fundamentos de trading',
  description: '',
  totalPoints: 100,
  passingPoints: 70,
  durationMinutes: 30,
  maxAttempts: 2,
  audience: 'selected',
  studentIds: ['jose'],
  opensAt: at(Date.now() - 3_600_000),
  closesAt: at(Date.now() + 3_600_000),
  questions: [
    {
      id: 'q1',
      type: 'trueFalse',
      text: '¿Sí?',
      imageUrl: '',
      options: [],
      points: 100,
      partial: false,
    },
  ],
  published: true,
  resultsPublished: false,
  showAnswers: false,
};

describe('AdminExams', () => {
  let fixture: ComponentFixture<AdminExams>;
  let el: HTMLElement;
  const service = {
    all: vi.fn(),
    key: vi.fn(async () => ({ answers: { q1: [1] } })),
    save: vi.fn(async () => 'new'),
    remove: vi.fn(async () => undefined),
  };
  const evaluations = { students: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    service.all.mockResolvedValue([
      existing,
      { ...existing, id: 'x2', title: 'Borrador', published: false },
    ]);
    evaluations.students.mockResolvedValue([
      { uid: 'jose', name: 'José Pérez', email: 'jose@x.co', academy: true },
      { uid: 'eva', name: 'Eva Ruiz', email: 'eva@x.co', academy: false },
    ]);
    TestBed.configureTestingModule({
      imports: [AdminExams],
      providers: [
        provideRouter([]),
        { provide: ExamService, useValue: service },
        { provide: EvaluationService, useValue: evaluations },
      ],
    });
    fixture = TestBed.createComponent(AdminExams);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  const byLabel = <T extends HTMLElement>(label: string) =>
    el.querySelector<T>(`[aria-label="${label}"]`)!;
  const type = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const message = () => el.querySelector('.message')?.textContent?.trim() ?? '';

  it('lists the forms with their state, points and audience', () => {
    const cards = [...el.querySelectorAll('.card')].map((c) => c.textContent);
    expect(cards[0]).toContain('Abierto');
    expect(cards[0]).toContain('100 puntos · aprueba con 70 · 1 pregunta');
    expect(cards[0]).toContain('1 alumno');
    expect(cards[1]).toContain('Borrador');
    expect(el.querySelector('a.btn')?.getAttribute('href')).toBe('/admin/forms/x1');
  });

  it('builds a form with points per question and saves its answer key apart', async () => {
    button('Nuevo formulario').click();
    await fixture.whenStable();
    await type(el.querySelector<HTMLInputElement>('.exam-form input[type=text]')!, 'Velas');
    await type(el.querySelector('.question textarea')!, '¿Qué es un martillo?');
    await type(byLabel('Pregunta 1 · Opción 1'), 'Vela alcista');
    await type(byLabel('Pregunta 1 · Opción 2'), 'Vela bajista');
    byLabel<HTMLInputElement>('La opción 1 es correcta').click();
    await fixture.whenStable();
    expect(el.querySelector('.sum')?.textContent).toContain('Suma: 10 de 100 puntos');

    // Publishing needs the points to add up to the total.
    el.querySelector<HTMLInputElement>('.exam-form > label.check input')!.click();
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(message()).toContain('Las preguntas suman 10 puntos y el puntaje total es 100.');
    expect(service.save).not.toHaveBeenCalled();

    await type(el.querySelector<HTMLInputElement>('.question .points input')!, '100');
    expect(el.querySelector('.sum')?.textContent).toContain('Suma: 100 de 100 puntos');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(service.save).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        title: 'Velas',
        totalPoints: 100,
        audience: 'all',
        published: true,
        questions: [
          expect.objectContaining({
            type: 'single',
            options: ['Vela alcista', 'Vela bajista'],
            points: 100,
          }),
        ],
      }),
      expect.anything(),
    );
    const key = (service.save.mock.calls[0] as unknown[])[2] as { answers: object };
    expect(Object.values(key.answers)).toEqual([[0]]);
    expect(message()).toContain('Se guardó el formulario Velas.');
  });

  it('adds, reorders and removes questions', async () => {
    button('Nuevo formulario').click();
    await fixture.whenStable();
    button('+ Agregar pregunta').click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.question')).toHaveLength(2);
    // The new one takes the points left.
    expect(el.querySelectorAll<HTMLInputElement>('.question .points input')[1].value).toBe('90');
    byLabel<HTMLSelectElement>('Tipo · Pregunta 2').value = 'open';
    byLabel<HTMLSelectElement>('Tipo · Pregunta 2').dispatchEvent(new Event('change'));
    await fixture.whenStable();
    byLabel<HTMLButtonElement>('Subir la pregunta 2').click();
    await fixture.whenStable();
    expect(el.querySelector('.question')?.textContent).toContain('El alumno escribe su respuesta');
    byLabel<HTMLButtonElement>('Eliminar la pregunta 1').click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.question')).toHaveLength(1);
  });

  it('edits a form with its right answers and students', async () => {
    button('Editar').click();
    await fixture.whenStable();
    expect(service.key).toHaveBeenCalledWith('x1');
    expect(el.textContent).toContain('Editar formulario');
    const radios = el.querySelectorAll<HTMLInputElement>('.tf input');
    expect(radios[1].checked).toBe(true);
    // Only students with academy access can be picked.
    expect(el.querySelector('.student-list')?.textContent).toContain('José Pérez');
    expect(el.querySelector('.student-list')?.textContent).not.toContain('Eva Ruiz');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(service.save).toHaveBeenCalledWith(
      'x1',
      expect.objectContaining({ studentIds: ['jose'], maxAttempts: 2 }),
      { answers: { q1: [1] } },
    );
  });

  it('deletes a form after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    byLabel<HTMLButtonElement>('Eliminar el formulario Fundamentos de trading').click();
    await fixture.whenStable();
    expect(service.remove).toHaveBeenCalledWith('x1');
    expect(el.querySelectorAll('.card')).toHaveLength(1);
  });
});
