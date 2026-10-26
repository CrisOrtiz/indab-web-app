import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/icon/icon';
import { I18n } from '../../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import {
  Exam,
  MAX_ATTEMPTS,
  MAX_QUESTIONS,
  QuestionType,
  examWindow,
  pointsSum,
} from '../../../core/models/exam';
import { EvaluationService, StudentOption } from '../../evaluations/evaluation.service';
import { ExamService } from '../../exams/exam.service';
import {
  EditorQuestion,
  ExamForm,
  cloneForm,
  formProblem,
  fromForm,
  newQuestion,
  toForm,
  withType,
} from './exam-form';

/**
 * Evaluation forms: trainers and admins build them here (questions, points per question, the
 * total and the score to pass), choose who takes them and when, and open each one's
 * submissions to grade them. Separate from the practice evaluations on the chart.
 */
@Component({
  selector: 'app-admin-exams',
  imports: [Icon, LocalDatePipe, RouterLink],
  templateUrl: './admin-exams.html',
  styleUrls: ['../admin.scss', '../evaluations/admin-evaluations.scss', './admin-exams.scss'],
})
export class AdminExams {
  private readonly service = inject(ExamService);
  private readonly evaluations = inject(EvaluationService);
  protected readonly i18n = inject(I18n);

  protected readonly types: QuestionType[] = ['single', 'multiple', 'trueFalse', 'open'];
  protected readonly attemptOptions = Array.from({ length: MAX_ATTEMPTS }, (_, i) => i + 1);
  protected readonly maxQuestions = MAX_QUESTIONS;

  protected readonly exams = signal<Exam[]>([]);
  protected readonly students = signal<StudentOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /** The form being built (`editing` null for a new one). */
  protected readonly form = signal<ExamForm | null>(null);
  protected readonly editing = signal<Exam | null>(null);
  /** The form being copied, while the editor holds its copy. */
  protected readonly cloning = signal<Exam | null>(null);
  protected readonly saving = signal(false);
  protected readonly studentSearch = signal('');

  protected readonly sum = computed(() => pointsSum(this.form()?.questions ?? []));
  protected readonly sumMatches = computed(
    () => this.sum() === Number(this.form()?.totalPoints ?? 0),
  );
  protected readonly visibleStudents = computed(() => {
    const term = this.studentSearch().trim().toLowerCase();
    const list = this.students().filter((s) => s.academy);
    return term ? list.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(term)) : list;
  });

  constructor() {
    void this.load();
  }

  protected stateOf(exam: Exam): 'draft' | 'upcoming' | 'open' | 'closed' {
    return exam.published ? examWindow(exam) : 'draft';
  }

  protected create(): void {
    this.editing.set(null);
    this.cloning.set(null);
    this.studentSearch.set('');
    this.form.set(toForm(null, null));
  }

  protected async edit(exam: Exam): Promise<void> {
    try {
      const key = await this.service.key(exam.id);
      this.editing.set(exam);
      this.cloning.set(null);
      this.studentSearch.set('');
      this.form.set(toForm(exam, key));
    } catch {
      this.message.set({ kind: 'error', text: this.i18n.messages().examAdmin.loadFailed });
    }
  }

  /** Opens the editor with a copy of the form, to assign it to other students. */
  protected async clone(exam: Exam): Promise<void> {
    const t = this.i18n.messages().examAdmin;
    try {
      const key = await this.service.key(exam.id);
      this.editing.set(null);
      this.cloning.set(exam);
      this.studentSearch.set('');
      this.message.set(null);
      this.form.set(cloneForm(exam, key, t.copyOf(exam.title)));
    } catch {
      this.message.set({ kind: 'error', text: t.loadFailed });
    }
  }

  protected cancel(): void {
    this.form.set(null);
    this.editing.set(null);
    this.cloning.set(null);
  }

  protected patch(change: Partial<ExamForm>): void {
    this.form.update((form) => (form ? { ...form, ...change } : form));
  }

  protected toggleStudent(uid: string, on: boolean): void {
    const ids = this.form()?.studentIds ?? [];
    this.patch({ studentIds: on ? [...new Set([...ids, uid])] : ids.filter((id) => id !== uid) });
  }

  protected selectAll(): void {
    const ids = this.form()?.studentIds ?? [];
    this.patch({ studentIds: [...new Set([...ids, ...this.visibleStudents().map((s) => s.uid)])] });
  }

  // Questions

  protected addQuestion(): void {
    const questions = this.form()?.questions ?? [];
    // A new question takes what is left of the total, or 10 points.
    const left = Number(this.form()?.totalPoints ?? 0) - pointsSum(questions);
    this.patch({ questions: [...questions, newQuestion('single', left > 0 ? left : 10)] });
  }

  protected updateQuestion(index: number, change: Partial<EditorQuestion>): void {
    this.patch({
      questions: (this.form()?.questions ?? []).map((q, i) =>
        i === index ? { ...q, ...change } : q,
      ),
    });
  }

  protected changeType(index: number, type: QuestionType): void {
    const question = this.form()?.questions[index];
    if (question) {
      this.updateQuestion(index, withType(question, type));
    }
  }

  protected moveQuestion(index: number, by: -1 | 1): void {
    const questions = [...(this.form()?.questions ?? [])];
    const target = index + by;
    if (target < 0 || target >= questions.length) {
      return;
    }
    [questions[index], questions[target]] = [questions[target], questions[index]];
    this.patch({ questions });
  }

  protected removeQuestion(index: number): void {
    this.patch({ questions: (this.form()?.questions ?? []).filter((_, i) => i !== index) });
  }

  protected setOption(index: number, option: number, text: string): void {
    const question = this.form()?.questions[index];
    if (question) {
      this.updateQuestion(index, {
        options: question.options.map((o, i) => (i === option ? text : o)),
      });
    }
  }

  protected addOption(index: number): void {
    const question = this.form()?.questions[index];
    if (question) {
      this.updateQuestion(index, { options: [...question.options, ''] });
    }
  }

  protected removeOption(index: number, option: number): void {
    const question = this.form()?.questions[index];
    if (question) {
      this.updateQuestion(index, {
        options: question.options.filter((_, i) => i !== option),
        correct: question.correct.filter((c) => c !== option).map((c) => (c > option ? c - 1 : c)),
      });
    }
  }

  /** Marks an option right (single and true/false keep one right answer). */
  protected setCorrect(index: number, option: number, on: boolean): void {
    const question = this.form()?.questions[index];
    if (!question) {
      return;
    }
    const correct =
      question.type === 'multiple'
        ? on
          ? [...new Set([...question.correct, option])].sort((a, b) => a - b)
          : question.correct.filter((c) => c !== option)
        : [option];
    this.updateQuestion(index, { correct });
  }

  protected async save(): Promise<void> {
    const form = this.form();
    const t = this.i18n.messages().examAdmin;
    if (!form) {
      return;
    }
    const problem = formProblem(form, t);
    if (problem) {
      this.message.set({ kind: 'error', text: problem });
      return;
    }
    const editing = this.editing();
    const { input, key } = fromForm(form, editing);
    this.saving.set(true);
    try {
      await this.service.save(editing?.id ?? null, input, key);
      this.message.set({ kind: 'ok', text: t.saved(input.title) });
      this.cancel();
      await this.reload();
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(exam: Exam): Promise<void> {
    const t = this.i18n.messages().examAdmin;
    if (!confirm(t.confirmDelete(exam.title))) {
      return;
    }
    try {
      await this.service.remove(exam.id);
      this.exams.update((list) => list.filter((e) => e.id !== exam.id));
    } catch {
      this.message.set({ kind: 'error', text: t.deleteFailed });
    }
  }

  private async load(): Promise<void> {
    try {
      const [, students] = await Promise.all([this.reload(), this.evaluations.students()]);
      this.students.set(students);
    } catch {
      this.message.set({ kind: 'error', text: this.i18n.messages().examAdmin.loadFailed });
    } finally {
      this.loading.set(false);
    }
  }

  private async reload(): Promise<void> {
    this.exams.set(await this.service.all());
  }
}
