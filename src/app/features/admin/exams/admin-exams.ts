import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActionsMenu, MenuAction } from '../../../shared/actions-menu/actions-menu';
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
import { Mentorship, audienceIds } from '../../../core/models/mentorship';
import { EvaluationService, StudentOption } from '../../evaluations/evaluation.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { NotificationService } from '../../notifications/notification.service';
import { AudiencePicker } from '../audience/audience-picker';
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
  imports: [ActionsMenu, AudiencePicker, Icon, LocalDatePipe, RouterLink],
  templateUrl: './admin-exams.html',
  styleUrls: ['../admin.scss', '../evaluations/admin-evaluations.scss', './admin-exams.scss'],
})
export class AdminExams {
  private readonly service = inject(ExamService);
  private readonly evaluations = inject(EvaluationService);
  private readonly mentorshipService = inject(MentorshipService);
  private readonly notifications = inject(NotificationService);
  protected readonly i18n = inject(I18n);

  protected readonly types: QuestionType[] = ['single', 'multiple', 'trueFalse', 'open'];
  protected readonly attemptOptions = Array.from({ length: MAX_ATTEMPTS }, (_, i) => i + 1);
  protected readonly maxQuestions = MAX_QUESTIONS;

  protected readonly exams = signal<Exam[]>([]);
  protected readonly students = signal<StudentOption[]>([]);
  protected readonly mentorships = signal<Mentorship[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /** The form being built (`editing` null for a new one). */
  protected readonly form = signal<ExamForm | null>(null);
  protected readonly editing = signal<Exam | null>(null);
  /** The form being copied, while the editor holds its copy. */
  protected readonly cloning = signal<Exam | null>(null);
  protected readonly saving = signal(false);

  protected readonly sum = computed(() => pointsSum(this.form()?.questions ?? []));
  protected readonly sumMatches = computed(
    () => this.sum() === Number(this.form()?.totalPoints ?? 0),
  );
  /** Mentorship names by id, for the cards. */
  private readonly mentorshipNames = computed(
    () => new Map(this.mentorships().map((m) => [m.id, m.name])),
  );

  /** The names of the mentorships an item is assigned to, for its card. */
  protected mentorshipList(item: Exam): string {
    const deleted = this.i18n.messages().audience.deleted;
    return (item.mentorshipIds ?? [])
      .map((id) => this.mentorshipNames().get(id) ?? deleted)
      .join(', ');
  }

  /** Each form's card menu, by id. */
  protected readonly menus = computed(() => {
    const t = this.i18n.messages().examAdmin;
    return new Map(
      this.exams().map((exam): [string, MenuAction[]] => [
        exam.id,
        [
          { id: 'grade', label: t.grade, icon: 'grade', link: ['/admin/forms', exam.id] },
          { id: 'edit', label: t.edit, icon: 'edit' },
          { id: 'clone', label: t.clone, icon: 'copy' },
          { id: 'delete', label: t.delete, icon: 'trash', danger: true },
        ],
      ]),
    );
  });

  constructor() {
    void this.load();
  }

  /** Runs an action picked from a card's menu. */
  protected act(exam: Exam, action: string): void {
    if (action === 'edit') {
      void this.edit(exam);
    } else if (action === 'clone') {
      void this.clone(exam);
    } else if (action === 'delete') {
      void this.remove(exam);
    }
  }

  protected stateOf(exam: Exam): 'draft' | 'upcoming' | 'open' | 'closed' {
    return exam.published ? examWindow(exam) : 'draft';
  }

  protected create(): void {
    this.editing.set(null);
    this.cloning.set(null);
    this.form.set(toForm(null, null));
  }

  protected async edit(exam: Exam): Promise<void> {
    try {
      const key = await this.service.key(exam.id);
      this.editing.set(exam);
      this.cloning.set(null);
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

  /** How many students a form for selected students is assigned to, mentorships included. */
  protected assignedCount(exam: Exam): number {
    return audienceIds(exam, this.students()).length;
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
      const id = await this.service.save(editing?.id ?? null, input, key);
      // Once published, students who were not given it before hear of it once.
      const before = new Set(editing?.published ? this.recipients(editing) : []);
      if (input.published) {
        void this.notifications.notifyStudents(
          'assigned',
          'exam',
          { id, title: input.title },
          this.recipients(input).filter((uid) => !before.has(uid)),
        );
      }
      this.message.set({ kind: 'ok', text: t.saved(input.title) });
      this.cancel();
      await this.reload();
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    } finally {
      this.saving.set(false);
    }
  }

  /** The students a form is given to: everyone with academy access, or its audience. */
  private recipients(exam: Pick<Exam, 'audience' | 'studentIds' | 'mentorshipIds'>): string[] {
    return exam.audience === 'all'
      ? this.students()
          .filter((s) => s.academy)
          .map((s) => s.uid)
      : audienceIds(exam, this.students());
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
      const [, students, mentorships] = await Promise.all([
        this.reload(),
        this.evaluations.students(),
        this.mentorshipService.all(),
      ]);
      this.students.set(students);
      this.mentorships.set(mentorships);
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
