import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import {
  Exam,
  ExamGrade,
  ExamKey,
  ExamQuestion,
  ExamSubmission,
  GRACE_MINUTES,
  attemptDeadline,
  bestGrade,
  suggestScore,
} from '../../../core/models/exam';
import { Mentorship, audienceIds, membersOf } from '../../../core/models/mentorship';
import { EvaluationService, StudentOption } from '../../evaluations/evaluation.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { MentorshipFilter } from '../audience/mentorship-filter';
import { ExamService } from '../../exams/exam.service';
import { optionLabels } from '../../exams/exam-labels';
import { pageCount, pageOf } from '../../../shared/pager/cursor-pages';
import { Pager } from '../../../shared/pager/pager';

/** Attempts per page of results. */
export const RESULTS_PAGE_SIZE = 20;

export type ResultState = 'inProgress' | 'expired' | 'submitted' | 'graded' | 'notStarted';

export interface ResultRow {
  uid: string;
  name: string;
  submission: ExamSubmission | null;
  grade: ExamGrade | null;
  state: ResultState;
}

/** What the grader is filling in for one attempt. */
interface GradeDraft {
  scores: Record<string, number | null>;
  comments: Record<string, string>;
  feedback: string;
}

/** The state of an attempt for the staff. */
export function resultState(
  exam: Exam,
  submission: ExamSubmission,
  grade: ExamGrade | null,
  now = Date.now(),
): ResultState {
  if (grade) {
    return 'graded';
  }
  if (submission.status === 'submitted') {
    return 'submitted';
  }
  const deadline = attemptDeadline(exam, submission.startedAt?.toMillis() ?? now);
  return now > deadline + GRACE_MINUTES * 60_000 ? 'expired' : 'inProgress';
}

/**
 * A form's submissions for trainers and admins: every attempt with its state and score, a
 * grading panel (closed questions come with suggested points from the answer key, open ones
 * wait for the grader) and the switches that publish the grades and the right answers. The
 * list filters by name and state and shows a page at a time (stats count every attempt).
 */
@Component({
  selector: 'app-exam-results',
  imports: [DecimalPipe, LocalDatePipe, MentorshipFilter, Pager, RouterLink],
  templateUrl: './exam-results.html',
  styleUrls: [
    '../admin.scss',
    '../evaluations/admin-evaluations.scss',
    '../../../shared/pager/_list-filters.scss',
    './exam-results.scss',
  ],
})
export class ExamResults {
  private readonly service = inject(ExamService);
  private readonly evaluations = inject(EvaluationService);
  private readonly mentorshipService = inject(MentorshipService);
  protected readonly i18n = inject(I18n);

  /** The form id, from the route. */
  readonly id = input.required<string>();

  protected readonly exam = signal<Exam | null>(null);
  protected readonly key = signal<ExamKey>({ answers: {} });
  protected readonly submissions = signal<ExamSubmission[]>([]);
  protected readonly grades = signal<ExamGrade[]>([]);
  protected readonly students = signal<StudentOption[]>([]);
  protected readonly names = computed(() => new Map(this.students().map((s) => [s.uid, s.name])));
  protected readonly mentorships = signal<Mentorship[]>([]);
  protected readonly loading = signal(true);
  protected readonly missing = signal(false);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /** The attempt being graded and the grader's draft. */
  protected readonly selected = signal<string | null>(null);
  protected readonly draft = signal<GradeDraft | null>(null);
  protected readonly saving = signal(false);

  protected readonly rows = computed<ResultRow[]>(() => {
    const exam = this.exam();
    if (!exam) {
      return [];
    }
    const grades = new Map(this.grades().map((g) => [g.id, g]));
    const rows: ResultRow[] = this.submissions().map((s) => {
      const grade = grades.get(s.id) ?? null;
      return {
        uid: s.uid,
        name: this.names().get(s.uid) || s.userName || s.uid,
        submission: s,
        grade,
        state: resultState(exam, s, grade),
      };
    });
    if (exam.audience === 'selected') {
      const started = new Set(rows.map((r) => r.uid));
      const assigned = audienceIds(exam, this.students());
      for (const uid of assigned.filter((id) => !started.has(id))) {
        const name = this.names().get(uid) || uid;
        rows.push({ uid, name, submission: null, grade: null, state: 'notStarted' });
      }
    }
    return rows.sort(
      (a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) ||
        (a.submission?.attempt ?? 0) - (b.submission?.attempt ?? 0),
    );
  });

  protected readonly states: ResultState[] = [
    'submitted',
    'graded',
    'inProgress',
    'expired',
    'notStarted',
  ];
  protected readonly search = signal('');
  protected readonly state = signal('');
  protected readonly mentorship = signal('');
  protected readonly page = signal(0);
  protected readonly matches = computed(() => {
    const term = this.search().trim().toLowerCase();
    const state = this.state();
    const mentorship = this.mentorship();
    const members = mentorship ? new Set(membersOf(mentorship, this.students())) : null;
    return this.rows().filter(
      (row) =>
        (!term || row.name.toLowerCase().includes(term)) &&
        (!state || row.state === state) &&
        (!members || members.has(row.uid)),
    );
  });
  protected readonly pages = computed(() => pageCount(this.matches().length, RESULTS_PAGE_SIZE));
  protected readonly visible = computed(() =>
    pageOf(this.matches(), Math.min(this.page(), this.pages() - 1), RESULTS_PAGE_SIZE),
  );

  protected readonly stats = computed(() => {
    const exam = this.exam();
    const rows = this.rows();
    const byStudent = new Map<string, ExamGrade[]>();
    for (const g of this.grades()) {
      byStudent.set(g.uid, [...(byStudent.get(g.uid) ?? []), g]);
    }
    const best = [...byStudent.values()].map((list) => bestGrade(list)!);
    return {
      submissions: rows.filter((r) => r.state !== 'notStarted' && r.state !== 'inProgress').length,
      graded: rows.filter((r) => r.state === 'graded').length,
      passed: best.filter((g) => exam && g.total >= exam.passingPoints).length,
      average: best.length ? best.reduce((sum, g) => sum + g.total, 0) / best.length : null,
    };
  });

  protected readonly current = computed(() =>
    this.rows().find((r) => r.submission?.id === this.selected()),
  );

  /** The draft's total and whether it passes. */
  protected readonly draftTotal = computed(() => {
    const scores = Object.values(this.draft()?.scores ?? {});
    return Math.round(scores.reduce<number>((sum, s) => sum + (s ?? 0), 0) * 100) / 100;
  });

  protected readonly optionLabels = (q: ExamQuestion) =>
    optionLabels(q, this.i18n.messages().exams);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  protected rightAnswer(q: ExamQuestion): number[] {
    return this.key().answers[q.id] ?? [];
  }

  protected suggestion(q: ExamQuestion): number | null {
    const answer = this.current()?.submission?.answers[q.id];
    return suggestScore(q, answer, this.key().answers[q.id]);
  }

  protected open(row: ResultRow): void {
    const submission = row.submission;
    const exam = this.exam();
    if (!submission || !exam) {
      return;
    }
    if (this.selected() === submission.id) {
      this.close();
      return;
    }
    this.selected.set(submission.id);
    const grade = row.grade;
    this.draft.set({
      scores: Object.fromEntries(
        exam.questions.map((q) => [
          q.id,
          grade?.scores[q.id] ??
            suggestScore(q, submission.answers[q.id], this.key().answers[q.id]),
        ]),
      ),
      comments: { ...(grade?.comments ?? {}) },
      feedback: grade?.feedback ?? '',
    });
  }

  protected filter(field: { set(value: string): void }, event: Event): void {
    field.set((event.target as HTMLInputElement | HTMLSelectElement).value);
    this.page.set(0);
  }

  protected close(): void {
    this.selected.set(null);
    this.draft.set(null);
  }

  protected setScore(questionId: string, value: string): void {
    this.draft.update((d) =>
      d ? { ...d, scores: { ...d.scores, [questionId]: value === '' ? null : Number(value) } } : d,
    );
  }

  protected setComment(questionId: string, value: string): void {
    this.draft.update((d) => (d ? { ...d, comments: { ...d.comments, [questionId]: value } } : d));
  }

  protected setFeedback(value: string): void {
    this.draft.update((d) => (d ? { ...d, feedback: value } : d));
  }

  protected async saveGrade(): Promise<void> {
    const exam = this.exam();
    const draft = this.draft();
    const row = this.current();
    const t = this.i18n.messages().examAdmin.results;
    if (!exam || !draft || !row?.submission) {
      return;
    }
    for (const [i, q] of exam.questions.entries()) {
      const score = draft.scores[q.id];
      if (score === null || score === undefined || !(score >= 0 && score <= q.points)) {
        this.message.set({ kind: 'error', text: t.pointsRange(i + 1, q.points) });
        return;
      }
    }
    const total = this.draftTotal();
    const comments = Object.fromEntries(
      Object.entries(draft.comments)
        .map(([id, text]) => [id, text.trim()])
        .filter(([, text]) => text),
    );
    this.saving.set(true);
    try {
      const grade = {
        examId: exam.id,
        uid: row.uid,
        attempt: row.submission.attempt,
        scores: draft.scores as Record<string, number>,
        comments,
        feedback: draft.feedback.trim(),
        total,
        passed: total >= exam.passingPoints,
      };
      await this.service.saveGrade(grade);
      this.grades.update((list) => [
        ...list.filter((g) => g.id !== row.submission!.id),
        { ...grade, id: row.submission!.id } as ExamGrade,
      ]);
      this.message.set({ kind: 'ok', text: t.gradeSaved(row.name) });
      this.close();
    } catch {
      this.message.set({ kind: 'error', text: t.gradeFailed });
    } finally {
      this.saving.set(false);
    }
  }

  protected async setResults(change: Partial<Pick<Exam, 'resultsPublished' | 'showAnswers'>>) {
    const exam = this.exam();
    const t = this.i18n.messages().examAdmin.results;
    if (!exam) {
      return;
    }
    const next = {
      resultsPublished: change.resultsPublished ?? exam.resultsPublished,
      showAnswers: change.showAnswers ?? exam.showAnswers,
    };
    try {
      await this.service.setResults(exam.id, next);
      this.exam.set({ ...exam, ...next });
      const text =
        change.resultsPublished !== undefined
          ? next.resultsPublished
            ? t.published(exam.title)
            : t.unpublished(exam.title)
          : next.showAnswers
            ? t.answersShown
            : t.answersHidden;
      this.message.set({ kind: 'ok', text });
    } catch {
      this.message.set({ kind: 'error', text: this.i18n.messages().examAdmin.saveFailed });
    }
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const [exam, key, submissions, grades, students, mentorships] = await Promise.all([
        this.service.get(id),
        this.service.key(id),
        this.service.submissions(id),
        this.service.grades(id),
        this.evaluations.students(),
        this.mentorshipService.all(),
      ]);
      this.missing.set(!exam);
      this.exam.set(exam);
      this.key.set(key);
      this.submissions.set(submissions);
      this.grades.set(grades);
      this.students.set(students);
      this.mentorships.set(mentorships);
    } catch {
      this.message.set({ kind: 'error', text: this.i18n.messages().examAdmin.results.loadFailed });
    } finally {
      this.loading.set(false);
    }
  }
}
