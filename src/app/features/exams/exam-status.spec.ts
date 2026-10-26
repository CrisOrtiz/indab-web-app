import { Exam, ExamGrade, ExamSubmission } from '../../core/models/exam';
import { attemptStatus, studentExamState } from './exam-status';

const minute = 60_000;
const at = (ms: number) => ({ toMillis: () => ms }) as never;
const exam = (extra: Partial<Exam> = {}) =>
  ({
    id: 'x1',
    opensAt: at(0),
    closesAt: at(1000 * minute),
    durationMinutes: 30,
    maxAttempts: 2,
    ...extra,
  }) as Exam;
const sub = (attempt: number, status: ExamSubmission['status'], startedAt = 0) =>
  ({
    id: `x1_u_${attempt}`,
    attempt,
    status,
    startedAt: at(startedAt),
  }) as unknown as ExamSubmission;

describe('student exam state', () => {
  it('waits for the window to open', () => {
    expect(studentExamState(exam({ opensAt: at(10 * minute) }), [], [], 0)).toMatchObject({
      list: 'upcoming',
    });
  });

  it('offers the first attempt, then the next once handed in', () => {
    expect(studentExamState(exam(), [], [], minute)).toMatchObject({
      list: 'pending',
      action: 'start',
      nextAttempt: 1,
    });
    expect(studentExamState(exam(), [sub(1, 'submitted')], [], minute)).toMatchObject({
      action: 'start',
      nextAttempt: 2,
      used: 1,
    });
  });

  it('continues an attempt until its time and grace are up', () => {
    const active = sub(1, 'inProgress');
    expect(studentExamState(exam(), [active], [], 31 * minute)).toMatchObject({
      action: 'continue',
      active,
    });
    expect(attemptStatus(exam(), active, 33 * minute)).toBe('expired');
    expect(studentExamState(exam(), [active], [], 33 * minute)).toMatchObject({
      action: 'start',
      nextAttempt: 2,
    });
  });

  it('is finished once attempts run out or the window closes, with the best grade', () => {
    const grades = [
      { attempt: 1, total: 50 },
      { attempt: 2, total: 90 },
    ] as ExamGrade[];
    const subs = [sub(1, 'submitted'), sub(2, 'submitted')];
    expect(studentExamState(exam(), subs, grades, minute)).toMatchObject({
      list: 'done',
      action: 'view',
      best: { total: 90 },
    });
    expect(studentExamState(exam(), [], [], 2000 * minute)).toMatchObject({ list: 'done' });
  });
});
