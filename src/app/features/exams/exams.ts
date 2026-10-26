import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { Exam, ExamGrade, ExamSubmission } from '../../core/models/exam';
import { ExamService } from './exam.service';
import { ExamList, StudentExamState, studentExamState } from './exam-status';

interface ExamCard {
  exam: Exam;
  state: StudentExamState;
}

/**
 * The student's evaluation forms in three lists: to do (open, or an attempt in progress),
 * upcoming, and finished, with the grade once staff publish it.
 */
@Component({
  selector: 'app-exams',
  imports: [LocalDatePipe, RouterLink],
  templateUrl: './exams.html',
  styleUrl: './exams.scss',
})
export class Exams {
  private readonly service = inject(ExamService);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly lists: ExamList[] = ['pending', 'upcoming', 'done'];
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  private readonly exams = signal<Exam[]>([]);
  private readonly submissions = signal<ExamSubmission[]>([]);
  private readonly grades = signal<ExamGrade[]>([]);

  protected readonly cards = computed(() => {
    const now = Date.now();
    const byList: Record<ExamList, ExamCard[]> = { pending: [], upcoming: [], done: [] };
    for (const exam of this.exams()) {
      const subs = this.submissions().filter((s) => s.examId === exam.id);
      const grades = this.grades().filter((g) => g.examId === exam.id);
      const state = studentExamState(exam, subs, grades, now);
      byList[state.list].push({ exam, state });
    }
    // Soonest first, except the finished ones (latest first).
    byList.pending.sort((a, b) => a.exam.closesAt.toMillis() - b.exam.closesAt.toMillis());
    byList.upcoming.sort((a, b) => a.exam.opensAt.toMillis() - b.exam.opensAt.toMillis());
    return byList;
  });
  protected readonly empty = computed(() => !this.exams().length);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loading.set(false);
      return;
    }
    try {
      const [exams, submissions] = await Promise.all([
        this.service.assignedTo(uid, this.auth.profile()?.mentorshipIds),
        this.service.mySubmissions(uid),
      ]);
      const published = new Set(exams.filter((e) => e.resultsPublished).map((e) => e.id));
      const graded = await this.service.myGrades(
        submissions.filter((s) => published.has(s.examId)),
      );
      this.exams.set(exams);
      this.submissions.set(submissions);
      this.grades.set(graded);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
