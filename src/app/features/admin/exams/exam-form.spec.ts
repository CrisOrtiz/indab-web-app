import { es } from '../../../core/i18n/messages/es';
import { Exam } from '../../../core/models/exam';
import {
  ExamForm,
  cloneForm,
  formProblem,
  fromForm,
  newQuestion,
  toForm,
  withType,
} from './exam-form';

const t = es.examAdmin;
const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }) as never;

const valid = (): ExamForm => ({
  ...toForm(null, null, new Date(2026, 9, 26, 10)),
  title: 'Fundamentos',
  questions: [
    {
      ...newQuestion('single', 60),
      id: 'q1',
      text: '¿RSI sobre 70?',
      options: ['Sobrecompra', '', 'Sobreventa'],
      correct: [2],
    },
    { ...newQuestion('open', 40), id: 'q2', text: '¿Stop loss?' },
  ],
  published: true,
});

describe('exam form', () => {
  it('starts a new form open for a week, worth 100 points', () => {
    const form = toForm(null, null, new Date(2026, 9, 26, 10, 30, 15));
    expect(form).toMatchObject({
      totalPoints: 100,
      passingPoints: 70,
      maxAttempts: 1,
      audience: 'all',
      opensAt: '2026-10-26T10:30',
      closesAt: '2026-11-02T10:30',
      published: false,
    });
    expect(form.questions).toHaveLength(1);
  });

  it('loads a form with its right answers', () => {
    const exam = {
      ...fromForm(valid(), null).input,
      id: 'x1',
      opensAt: at(0),
      closesAt: at(1000),
    } as unknown as Exam;
    const form = toForm(exam, { answers: { q1: [1] } });
    expect(form.questions[0].correct).toEqual([1]);
    expect(form.questions[1].correct).toEqual([]);
  });

  it('copies a form as a new draft for other students', () => {
    const exam = {
      ...fromForm({ ...valid(), audience: 'selected', studentIds: ['jose'] }, null).input,
      id: 'x1',
      resultsPublished: true,
      opensAt: at(0),
      closesAt: at(3 * 86_400_000),
    } as unknown as Exam;
    const form = cloneForm(
      exam,
      { answers: { q1: [1] } },
      'Fundamentos (copia)',
      new Date(2026, 9, 26, 10, 30, 15),
    );
    expect(form).toMatchObject({
      title: 'Fundamentos (copia)',
      totalPoints: 100,
      audience: 'selected',
      studentIds: [],
      opensAt: '2026-10-26T10:30',
      closesAt: '2026-10-29T10:30',
      published: false,
    });
    expect(form.questions.map((q) => [q.text, q.points, q.correct])).toEqual([
      ['¿RSI sobre 70?', 60, [1]],
      ['¿Stop loss?', 40, []],
    ]);
    // Saved as a new form, the copy starts without published results.
    expect(fromForm(form, null).input).toMatchObject({ resultsPublished: false });
  });

  it('keeps choices when switching between single and multiple', () => {
    const q = { ...newQuestion('multiple'), options: ['a', 'b'], correct: [0, 1] };
    expect(withType(q, 'single')).toMatchObject({ options: ['a', 'b'], correct: [0] });
    expect(withType(q, 'trueFalse')).toMatchObject({ options: [], correct: [0] });
    expect(withType(q, 'open')).toMatchObject({ options: [], correct: [] });
  });

  it('accepts a complete form', () => {
    expect(formProblem(valid(), t)).toBeNull();
  });

  it('explains what is missing', () => {
    const form = valid();
    expect(formProblem({ ...form, title: ' ' }, t)).toBe(t.titleRequired);
    expect(formProblem({ ...form, passingPoints: 120 }, t)).toBe(t.passingRange);
    expect(formProblem({ ...form, durationMinutes: 2.5 }, t)).toBe(t.durationRange);
    expect(formProblem({ ...form, closesAt: form.opensAt }, t)).toBe(t.windowInvalid);
    expect(formProblem({ ...form, audience: 'selected' }, t)).toBe(t.studentsRequired);
    const [q1, q2] = form.questions;
    expect(formProblem({ ...form, questions: [{ ...q1, correct: [] }, q2] }, t)).toBe(
      t.questionCorrect(1),
    );
    expect(formProblem({ ...form, questions: [{ ...q1, options: ['a', ''] }, q2] }, t)).toBe(
      t.questionOptions(1),
    );
    expect(formProblem({ ...form, questions: [q1, { ...q2, imageUrl: 'http://x' }] }, t)).toBe(
      t.questionImage(2),
    );
    expect(formProblem({ ...form, questions: [q1] }, t)).toBe(t.sumMismatch(60, 100));
    // A draft may be unfinished in its points.
    expect(formProblem({ ...form, questions: [q1], published: false }, t)).toBeNull();
  });

  it('stores the questions without their answers, dropping blank options', () => {
    const { input, key } = fromForm(valid(), null);
    expect(input.questions[0]).toEqual({
      id: 'q1',
      type: 'single',
      text: '¿RSI sobre 70?',
      imageUrl: '',
      options: ['Sobrecompra', 'Sobreventa'],
      points: 60,
      partial: false,
    });
    expect(JSON.stringify(input)).not.toContain('correct');
    expect(key).toEqual({ answers: { q1: [1] } });
    expect(input).toMatchObject({ studentIds: [], resultsPublished: false, showAnswers: false });
  });
});
