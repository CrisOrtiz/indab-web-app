import type { Messages } from '../../core/i18n/messages/es';
import { ExamQuestion } from '../../core/models/exam';

/** The options a question shows: its own, or true and false. */
export const optionLabels = (question: ExamQuestion, t: Messages['exams']): string[] =>
  question.type === 'trueFalse' ? [t.true, t.false] : question.options;
