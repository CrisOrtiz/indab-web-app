import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { Evaluation } from '../../core/models/evaluation';
import { EvaluationService } from '../evaluations/evaluation.service';
import { PracticeService } from '../practice/practice.service';
import { EvaluationStanding, evaluationStandings } from './standings';

/**
 * Practice ranking, part of the academy: the ranking of each timed evaluation once its results
 * are published (staff see every evaluation's). Free practice is not ranked. Results are what
 * the students' browsers logged, so they rank practice, not a trusted grade.
 */
@Component({
  selector: 'app-ranking',
  imports: [DecimalPipe, PercentPipe, RouterLink],
  templateUrl: './ranking.html',
  styleUrl: './ranking.scss',
})
export class Ranking {
  private readonly auth = inject(AuthService);
  private readonly practice = inject(PracticeService);
  private readonly evaluationService = inject(EvaluationService);
  protected readonly i18n = inject(I18n);

  protected readonly evaluations = signal<Evaluation[] | null>(null);
  protected readonly selected = signal<string | null>(null);
  protected readonly results = signal<EvaluationStanding[] | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.loadEvaluations();
  }

  protected isMe(uid: string): boolean {
    return uid === this.auth.user()?.uid;
  }

  protected async select(id: string): Promise<void> {
    this.selected.set(id || null);
    this.results.set(null);
    if (!id) {
      return;
    }
    try {
      const sessions = await this.practice.evaluationSessions(id);
      if (this.selected() === id) {
        this.results.set(evaluationStandings(sessions));
      }
    } catch {
      this.results.set([]);
      this.error.set(this.i18n.messages().ranking.loadFailed);
    }
  }

  /** Staff see every evaluation; students the published ones they were assigned to. */
  private async loadEvaluations(): Promise<void> {
    const uid = this.auth.user()?.uid;
    try {
      const list = this.auth.isStaff()
        ? await this.evaluationService.all()
        : (
            await this.evaluationService.assignedTo(uid ?? '', this.auth.profile()?.mentorshipIds)
          ).filter((e) => e.resultsPublished);
      this.evaluations.set(list);
      if (list.length) {
        await this.select(list[0].id);
      }
    } catch {
      this.evaluations.set([]);
      this.error.set(this.i18n.messages().ranking.loadFailed);
    }
  }
}
