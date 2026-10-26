import {
  ExamQuestion,
  attemptDeadline,
  bestGrade,
  examWindow,
  pointsSum,
  submissionId,
  suggestScore,
} from './exam';

const at = (ms: number) => ({ toMillis: () => ms }) as never;
const question = (extra: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id: 'q1',
  type: 'single',
  text: '¿RSI?',
  imageUrl: '',
  options: ['a', 'b', 'c'],
  points: 20,
  partial: false,
  ...extra,
});
const answer = (...choices: number[]) => ({ choices, text: '' });

describe('exam helpers', () => {
  it('names attempts by form, student and number', () => {
    expect(submissionId('x1', 'jose', 2)).toBe('x1_jose_2');
  });

  it('places now in the window', () => {
    const exam = { opensAt: at(100), closesAt: at(200) };
    expect(examWindow(exam, 50)).toBe('upcoming');
    expect(examWindow(exam, 150)).toBe('open');
    expect(examWindow(exam, 200)).toBe('closed');
  });

  it('ends an attempt at its time limit or the window close, whichever comes first', () => {
    const minute = 60_000;
    expect(attemptDeadline({ closesAt: at(100 * minute), durationMinutes: 30 }, 0)).toBe(
      30 * minute,
    );
    expect(attemptDeadline({ closesAt: at(100 * minute), durationMinutes: 30 }, 90 * minute)).toBe(
      100 * minute,
    );
    expect(attemptDeadline({ closesAt: at(100 * minute), durationMinutes: 0 }, 0)).toBe(
      100 * minute,
    );
  });

  it('adds up the points', () => {
    expect(pointsSum([{ points: 20 }, { points: 0.1 }, { points: 0.2 }])).toBe(20.3);
  });

  it('scores single and true/false questions all or nothing', () => {
    expect(suggestScore(question(), answer(1), [1])).toBe(20);
    expect(suggestScore(question(), answer(0), [1])).toBe(0);
    expect(suggestScore(question(), undefined, [1])).toBe(0);
    expect(suggestScore(question({ type: 'trueFalse', options: [] }), answer(0), [0])).toBe(20);
  });

  it('scores several right answers exactly, or in part when asked', () => {
    const multiple = question({ type: 'multiple', points: 30 });
    expect(suggestScore(multiple, answer(0, 2), [0, 2])).toBe(30);
    expect(suggestScore(multiple, answer(0), [0, 2])).toBe(0);
    const partial = { ...multiple, partial: true };
    expect(suggestScore(partial, answer(0), [0, 2])).toBe(15);
    // Each wrong tick takes one right one back.
    expect(suggestScore(partial, answer(0, 1), [0, 2])).toBe(0);
    expect(suggestScore(partial, answer(0, 1, 2), [0, 2])).toBe(15);
  });

  it('leaves open answers to the grader', () => {
    expect(suggestScore(question({ type: 'open' }), { choices: [], text: 'x' }, [])).toBeNull();
  });

  it('keeps the best grade, the earlier attempt on a tie', () => {
    expect(bestGrade([])).toBeNull();
    expect(
      bestGrade([
        { attempt: 1, total: 60 },
        { attempt: 2, total: 80 },
        { attempt: 3, total: 80 },
      ]),
    ).toEqual({ attempt: 2, total: 80 });
  });
});
