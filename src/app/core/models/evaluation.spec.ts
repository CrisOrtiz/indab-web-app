import { Timestamp } from 'firebase/firestore';
import { Evaluation, attemptId, evaluationWindow } from './evaluation';

describe('evaluation helpers', () => {
  const at = (ms: number) => ({ toMillis: () => ms }) as Timestamp;
  const evaluation = { opensAt: at(1000), closesAt: at(2000) } as Evaluation;

  it('tells where now falls in the window', () => {
    expect(evaluationWindow(evaluation, 999)).toBe('upcoming');
    expect(evaluationWindow(evaluation, 1000)).toBe('open');
    expect(evaluationWindow(evaluation, 1999)).toBe('open');
    expect(evaluationWindow(evaluation, 2000)).toBe('closed');
  });

  it('names an attempt after the evaluation and student', () => {
    expect(attemptId('e1', 'u1')).toBe('e1_u1');
  });
});
