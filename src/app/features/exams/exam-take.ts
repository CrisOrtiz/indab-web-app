import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import {
  Exam,
  ExamAnswer,
  ExamGrade,
  ExamKey,
  ExamQuestion,
  ExamSubmission,
  attemptDeadline,
  examWindow,
} from '../../core/models/exam';
import { NoteTarget } from '../../core/models/mentor-note';
import { MentorNotes } from '../notes/mentor-notes';
import { NotificationService } from '../notifications/notification.service';
import { ExamService } from './exam.service';
import { optionLabels } from './exam-labels';
import { attemptStatus, studentExamState } from './exam-status';

/** Saves answers this long after the last change. */
const SAVE_DELAY = 800;

/** mm:ss, or h:mm:ss past an hour. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * One evaluation form for a student: its details and attempts, answering an attempt one
 * question at a time (saved as they go, handed in by them or when the time runs out), and,
 * once staff publish the results, the grade per question with the trainer's comments. Mentors'
 * notes on each attempt show as soon as they are written.
 */
@Component({
  selector: 'app-exam-take',
  imports: [LocalDatePipe, MentorNotes, RouterLink],
  templateUrl: './exam-take.html',
  styleUrl: './exam-take.scss',
})
export class ExamTake {
  private readonly service = inject(ExamService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  protected readonly i18n = inject(I18n);

  /** The form id, from the route. */
  readonly id = input.required<string>();

  protected readonly exam = signal<Exam | null>(null);
  protected readonly submissions = signal<ExamSubmission[]>([]);
  protected readonly grades = signal<ExamGrade[]>([]);
  protected readonly key = signal<ExamKey | null>(null);
  protected readonly loading = signal(true);
  protected readonly missing = signal(false);
  protected readonly notice = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /** The attempt being answered. */
  protected readonly attempt = signal<ExamSubmission | null>(null);
  protected readonly answers = signal<Record<string, ExamAnswer>>({});
  protected readonly index = signal(0);
  protected readonly saveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  protected readonly busy = signal(false);
  /** The graded attempt being reviewed. */
  protected readonly reviewing = signal<ExamGrade | null>(null);
  protected readonly now = signal(Date.now());

  protected readonly state = computed(() => {
    const exam = this.exam();
    return exam ? studentExamState(exam, this.submissions(), this.grades(), this.now()) : null;
  });
  protected readonly window = computed(() => {
    const exam = this.exam();
    return exam ? examWindow(exam, this.now()) : null;
  });
  protected readonly deadline = computed(() => {
    const exam = this.exam();
    const attempt = this.attempt();
    return exam && attempt
      ? attemptDeadline(exam, attempt.startedAt?.toMillis() ?? this.now())
      : null;
  });
  protected readonly timeLeft = computed(() => {
    const deadline = this.deadline();
    return deadline === null ? null : deadline - this.now();
  });
  /** Where the mentors' notes on each attempt are (not on the one being answered). */
  protected readonly noteTargets = computed(() => {
    const exam = this.exam();
    const uid = this.auth.user()?.uid ?? '';
    return exam
      ? this.submissions()
          .filter((s) => s.id !== this.attempt()?.id)
          .map((s) => ({
            attempt: s.attempt,
            target: {
              studentId: uid,
              kind: 'exam',
              targetId: s.id,
              contextId: exam.id,
              title: exam.title,
            } satisfies NoteTarget as NoteTarget,
          }))
      : [];
  });
  protected readonly question = computed(() => this.exam()?.questions[this.index()] ?? null);
  protected readonly unanswered = computed(
    () => (this.exam()?.questions ?? []).filter((q) => !this.isAnswered(q)).length,
  );

  protected readonly clock = clock;
  protected readonly statusOf = (s: ExamSubmission) => attemptStatus(this.exam()!, s, this.now());
  protected readonly gradeOf = (s: ExamSubmission) =>
    this.grades().find((g) => g.id === s.id) ?? null;
  protected readonly optionLabels = (q: ExamQuestion) =>
    optionLabels(q, this.i18n.messages().exams);

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private handingIn = false;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
    // The clock: counts down an attempt and moves exams between lists.
    const tick = setInterval(() => {
      this.now.set(Date.now());
      const left = this.timeLeft();
      if (left !== null && left <= 0 && this.attempt() && !this.handingIn) {
        void this.handIn(true);
      }
    }, 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
      }
      // Leaving mid-attempt keeps what was answered.
      if (this.dirty && this.attempt()) {
        void this.service.saveAnswers(this.attempt()!.id, this.answers()).catch(() => undefined);
      }
    });
  }

  protected isAnswered(q: ExamQuestion): boolean {
    const answer = this.answers()[q.id];
    return q.type === 'open' ? !!answer?.text.trim() : !!answer?.choices.length;
  }

  protected picked(q: ExamQuestion, option: number): boolean {
    return this.answers()[q.id]?.choices.includes(option) ?? false;
  }

  protected choose(q: ExamQuestion, option: number, on: boolean): void {
    const current = this.answers()[q.id]?.choices ?? [];
    const choices =
      q.type === 'multiple'
        ? on
          ? [...new Set([...current, option])].sort((a, b) => a - b)
          : current.filter((c) => c !== option)
        : [option];
    this.setAnswer(q, { choices, text: '' });
  }

  protected write(q: ExamQuestion, text: string): void {
    this.setAnswer(q, { choices: [], text: text.slice(0, 5000) });
  }

  protected go(index: number): void {
    const count = this.exam()?.questions.length ?? 0;
    if (index >= 0 && index < count) {
      this.index.set(index);
      void this.flush();
    }
  }

  protected async startOrContinue(): Promise<void> {
    const exam = this.exam();
    const state = this.state();
    const t = this.i18n.messages().exams;
    if (!exam || !state || this.busy()) {
      return;
    }
    if (state.action === 'continue' && state.active) {
      this.begin(state.active);
      return;
    }
    if (state.action !== 'start' || !state.nextAttempt) {
      return;
    }
    if (!confirm(t.confirmStart(exam.durationMinutes))) {
      return;
    }
    this.busy.set(true);
    try {
      const id = await this.service.start(exam, state.nextAttempt);
      const created = await this.service.getSubmission(id);
      if (created) {
        this.submissions.update((list) => [...list, created]);
        this.begin(created);
      }
    } catch {
      this.notice.set({ kind: 'error', text: t.startFailed });
    } finally {
      this.busy.set(false);
    }
  }

  /** Hands the attempt in: by the student (asked first) or when the time is up. */
  protected async handIn(timeUp = false): Promise<void> {
    const attempt = this.attempt();
    const t = this.i18n.messages().exams;
    if (!attempt || this.handingIn) {
      return;
    }
    if (!timeUp && !confirm(t.confirmSubmit(this.unanswered()))) {
      return;
    }
    this.handingIn = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await this.service.submit(attempt.id, this.answers());
      this.finish(attempt, timeUp ? t.timeUp : t.submitted, 'submitted');
      const exam = this.exam();
      if (exam) {
        void this.notifications.notifyActivity({
          type: 'examSubmitted',
          kind: 'exam',
          refId: attempt.id,
          contextId: exam.id,
          title: exam.title,
        });
      }
    } catch {
      if (timeUp) {
        // Too late for the rules: the last saved answers are what staff will grade.
        this.finish(attempt, t.timeUp, 'inProgress');
      } else {
        this.notice.set({ kind: 'error', text: t.saveFailed });
      }
    } finally {
      this.handingIn = false;
    }
  }

  protected review(grade: ExamGrade | null): void {
    this.reviewing.set(this.reviewing()?.id === grade?.id ? null : grade);
  }

  protected answerOf(grade: ExamGrade, q: ExamQuestion): ExamAnswer | undefined {
    return this.submissions().find((s) => s.id === grade.id)?.answers[q.id];
  }

  protected rightAnswer(q: ExamQuestion): number[] {
    return this.key()?.answers[q.id] ?? [];
  }

  private begin(submission: ExamSubmission): void {
    this.notice.set(null);
    this.reviewing.set(null);
    this.attempt.set(submission);
    this.answers.set({ ...submission.answers });
    this.index.set(0);
    this.saveState.set('idle');
    this.dirty = false;
  }

  private finish(attempt: ExamSubmission, text: string, status: ExamSubmission['status']): void {
    const answers = this.answers();
    this.submissions.update((list) =>
      list.map((s) => (s.id === attempt.id ? { ...s, answers, status } : s)),
    );
    this.attempt.set(null);
    this.dirty = false;
    this.notice.set({ kind: 'ok', text });
  }

  private setAnswer(q: ExamQuestion, answer: ExamAnswer): void {
    this.answers.update((all) => ({ ...all, [q.id]: answer }));
    this.dirty = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY);
  }

  private async flush(): Promise<void> {
    const attempt = this.attempt();
    if (!attempt || !this.dirty) {
      return;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.dirty = false;
    this.saveState.set('saving');
    try {
      await this.service.saveAnswers(attempt.id, this.answers());
      this.saveState.set('saved');
    } catch {
      this.dirty = true;
      this.saveState.set('error');
    }
  }

  private async load(id: string): Promise<void> {
    const uid = this.auth.user()?.uid;
    this.loading.set(true);
    try {
      const exam = uid ? await this.service.get(id) : null;
      if (!exam || !uid) {
        this.missing.set(true);
        return;
      }
      const submissions = await this.service.mySubmissions(uid, id);
      const grades = exam.resultsPublished ? await this.service.myGrades(submissions) : [];
      const key =
        exam.resultsPublished && exam.showAnswers
          ? await this.service.key(id).catch(() => null)
          : null;
      this.exam.set(exam);
      this.submissions.set(submissions);
      this.grades.set(grades);
      this.key.set(key);
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
