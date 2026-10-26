import {
  Exam,
  ExamKey,
  ExamQuestion,
  MAX_QUESTIONS,
  QuestionType,
  pointsSum,
} from '../../../core/models/exam';
import type { Messages } from '../../../core/i18n/messages/es';
import { ExamInput } from '../../exams/exam.service';

/** A question as the editor holds it: with its right answers, which are saved apart. */
export interface EditorQuestion extends ExamQuestion {
  correct: number[];
}

/** The form being built, as the inputs hold it. */
export interface ExamForm {
  title: string;
  description: string;
  totalPoints: number;
  passingPoints: number;
  durationMinutes: number;
  maxAttempts: number;
  audience: Exam['audience'];
  studentIds: string[];
  mentorshipIds: string[];
  /** yyyy-mm-ddTHH:mm, local time. */
  opensAt: string;
  closesAt: string;
  questions: EditorQuestion[];
  published: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

/** A date as a `datetime-local` input value, in local time. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const hasChoices = (type: QuestionType) => type === 'single' || type === 'multiple';

export const newQuestionId = (): string => Math.random().toString(36).slice(2, 10);

export function newQuestion(type: QuestionType = 'single', points = 10): EditorQuestion {
  return {
    id: newQuestionId(),
    type,
    text: '',
    imageUrl: '',
    options: hasChoices(type) ? ['', ''] : [],
    points,
    partial: false,
    correct: type === 'trueFalse' ? [0] : [],
  };
}

/** The question with another type: choices are kept between single and multiple. */
export function withType(question: EditorQuestion, type: QuestionType): EditorQuestion {
  const keep = hasChoices(type) && hasChoices(question.type);
  return {
    ...question,
    type,
    options: keep ? question.options : hasChoices(type) ? ['', ''] : [],
    correct: keep
      ? type === 'single'
        ? question.correct.slice(0, 1)
        : question.correct
      : type === 'trueFalse'
        ? [0]
        : [],
    partial: type === 'multiple' && question.partial,
  };
}

/** The editor's starting state: a new form, or an existing one with its answer key. */
export function toForm(exam: Exam | null, key: ExamKey | null, now = new Date()): ExamForm {
  if (!exam) {
    const opens = new Date(now);
    opens.setSeconds(0, 0);
    return {
      title: '',
      description: '',
      totalPoints: 100,
      passingPoints: 70,
      durationMinutes: 30,
      maxAttempts: 1,
      audience: 'all',
      studentIds: [],
      mentorshipIds: [],
      opensAt: toLocalInput(opens),
      closesAt: toLocalInput(new Date(opens.getTime() + 7 * DAY)),
      questions: [newQuestion()],
      published: false,
    };
  }
  return {
    title: exam.title,
    description: exam.description,
    totalPoints: exam.totalPoints,
    passingPoints: exam.passingPoints,
    durationMinutes: exam.durationMinutes,
    maxAttempts: exam.maxAttempts,
    audience: exam.audience,
    studentIds: [...exam.studentIds],
    mentorshipIds: [...(exam.mentorshipIds ?? [])],
    opensAt: toLocalInput(exam.opensAt.toDate()),
    closesAt: toLocalInput(exam.closesAt.toDate()),
    questions: exam.questions.map((q) => ({ ...q, correct: [...(key?.answers[q.id] ?? [])] })),
    published: exam.published,
  };
}

/**
 * A copy of a form to assign to other students: same questions, answer key, points and
 * settings, saved as a new draft. Its window opens now and lasts as long as the original's,
 * and the chosen students and mentorships are cleared so staff pick the new ones.
 */
export function cloneForm(
  exam: Exam,
  key: ExamKey | null,
  title: string,
  now = new Date(),
): ExamForm {
  const form = toForm(exam, key);
  const opens = new Date(now);
  opens.setSeconds(0, 0);
  const length = Math.max(exam.closesAt.toMillis() - exam.opensAt.toMillis(), DAY);
  return {
    ...form,
    title: title.slice(0, 120),
    studentIds: [],
    mentorshipIds: [],
    opensAt: toLocalInput(opens),
    closesAt: toLocalInput(new Date(opens.getTime() + length)),
    questions: form.questions.map((q) => ({ ...q, options: [...q.options] })),
    published: false,
  };
}

/** The first problem that keeps the form from being saved, or null. */
export function formProblem(form: ExamForm, t: Messages['examAdmin']): string | null {
  const total = Number(form.totalPoints);
  const passing = Number(form.passingPoints);
  const duration = Number(form.durationMinutes);
  const opens = new Date(form.opensAt).getTime();
  const closes = new Date(form.closesAt).getTime();
  if (!form.title.trim()) {
    return t.titleRequired;
  }
  if (!(total > 0 && total <= 1000)) {
    return t.totalRange;
  }
  if (!(passing >= 0 && passing <= total)) {
    return t.passingRange;
  }
  if (!(Number.isInteger(duration) && duration >= 0 && duration <= 600)) {
    return t.durationRange;
  }
  if (isNaN(opens) || isNaN(closes) || closes <= opens) {
    return t.windowInvalid;
  }
  if (form.audience === 'selected' && !form.studentIds.length && !form.mentorshipIds.length) {
    return t.studentsRequired;
  }
  if (form.published && !form.questions.length) {
    return t.questionsRequired;
  }
  for (const [i, q] of form.questions.entries()) {
    const n = i + 1;
    if (!q.text.trim()) {
      return t.questionTextRequired(n);
    }
    if (q.imageUrl.trim() && !/^https:\/\/\S+$/.test(q.imageUrl.trim())) {
      return t.questionImage(n);
    }
    if (!(Number(q.points) > 0)) {
      return t.questionPoints(n);
    }
    if (hasChoices(q.type) && q.options.filter((o) => o.trim()).length < 2) {
      return t.questionOptions(n);
    }
    if (q.type !== 'open' && !q.correct.some((c) => c < Math.max(q.options.length, 2))) {
      return t.questionCorrect(n);
    }
  }
  const sum = pointsSum(form.questions);
  if (form.published && sum !== total) {
    return t.sumMismatch(sum, total);
  }
  return null;
}

/** What gets stored: the form without right answers, and its answer key. */
export function fromForm(
  form: ExamForm,
  existing: Exam | null,
): { input: ExamInput; key: ExamKey } {
  const questions = form.questions.slice(0, MAX_QUESTIONS).map((q) => {
    // Options left blank are dropped, and the right answers renumbered to match.
    const kept = hasChoices(q.type)
      ? q.options.map((text, index) => ({ text: text.trim(), index })).filter((o) => o.text)
      : [];
    const correct = hasChoices(q.type)
      ? kept.flatMap((o, i) => (q.correct.includes(o.index) ? [i] : []))
      : q.correct;
    return {
      question: {
        id: q.id,
        type: q.type,
        text: q.text.trim(),
        imageUrl: q.imageUrl.trim(),
        options: kept.map((o) => o.text),
        points: Number(q.points),
        partial: q.type === 'multiple' && q.partial,
      } satisfies ExamQuestion,
      correct,
    };
  });
  return {
    input: {
      title: form.title.trim(),
      description: form.description.trim(),
      totalPoints: Number(form.totalPoints),
      passingPoints: Number(form.passingPoints),
      durationMinutes: Number(form.durationMinutes),
      maxAttempts: Number(form.maxAttempts),
      audience: form.audience,
      studentIds: form.audience === 'selected' ? form.studentIds : [],
      mentorshipIds: form.audience === 'selected' ? form.mentorshipIds : [],
      opensAt: new Date(form.opensAt),
      closesAt: new Date(form.closesAt),
      questions: questions.map((q) => q.question),
      published: form.published,
      resultsPublished: existing?.resultsPublished ?? false,
      showAnswers: existing?.showAnswers ?? false,
    },
    key: {
      answers: Object.fromEntries(
        questions.filter((q) => q.question.type !== 'open').map((q) => [q.question.id, q.correct]),
      ),
    },
  };
}
