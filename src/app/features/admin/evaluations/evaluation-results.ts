import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n.service';
import { Mentorship, membersOf } from '../../../core/models/mentorship';
import { MentorshipFilter } from '../audience/mentorship-filter';
import { Pager } from '../../../shared/pager/pager';
import { pageCount, pageOf } from '../../../shared/pager/cursor-pages';
import { EvaluationStanding } from '../../ranking/standings';

/** Students per page of results. */
export const RESULTS_PAGE_SIZE = 20;

/**
 * An evaluation's ranking for trainers and admins, with a name search, a status filter and
 * pages. Every attempt is already loaded (one per assigned student, needed to rank them), so
 * filtering keeps each student's place in the full ranking.
 */
@Component({
  selector: 'app-evaluation-results',
  imports: [DecimalPipe, MentorshipFilter, Pager, PercentPipe],
  template: `
    @let t = i18n.messages().evaluations;
    @let tl = i18n.messages().lists;
    <div class="list-filters" role="group" [attr.aria-label]="tl.filters">
      <label>
        {{ tl.search }}
        <input
          type="search"
          [placeholder]="tl.searchPlaceholder"
          [value]="search()"
          (input)="filter(search, $event)"
        />
      </label>
      @if (mentorships().length) {
        <app-mentorship-filter
          [mentorships]="mentorships()"
          [value]="mentorship()"
          (valueChange)="mentorship.set($event); page.set(0)"
        />
      }
      <label>
        {{ tl.status }}
        <select [value]="status()" (change)="filter(status, $event)">
          <option value="">{{ tl.allStatuses }}</option>
          @for (state of states; track state) {
            <option [value]="state">{{ t.attemptStates[state] }}</option>
          }
        </select>
      </label>
    </div>
    <table class="users results">
      <thead>
        <tr>
          <th>#</th>
          <th>{{ t.student }}</th>
          <th>{{ t.status }}</th>
          <th>{{ t.pnl }}</th>
          <th>{{ t.return }}</th>
          <th>{{ t.trades }}</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.uid) {
          <tr>
            <td data-label="#">{{ row.rank ?? '—' }}</td>
            <td [attr.data-label]="t.student" class="name">{{ row.name }}</td>
            <td [attr.data-label]="t.status">{{ t.attemptStates[row.status] }}</td>
            <td
              [attr.data-label]="t.pnl"
              [class.up]="(row.pnl ?? 0) > 0"
              [class.down]="(row.pnl ?? 0) < 0"
            >
              {{ row.pnl === null ? '—' : (row.pnl | number: '1.2-2') }}
            </td>
            <td [attr.data-label]="t.return">
              {{ row.return === null ? '—' : (row.return | percent: '1.1-1') }}
            </td>
            <td [attr.data-label]="t.trades">{{ row.trades ?? '—' }}</td>
          </tr>
        } @empty {
          <tr>
            <td colspan="6" class="muted empty">
              {{ standings().length ? tl.noMatches : t.noAttempts }}
            </td>
          </tr>
        }
      </tbody>
    </table>
    <app-pager
      [page]="page()"
      [pages]="pages()"
      [hasNext]="page() + 1 < pages()"
      (previous)="page.set(page() - 1)"
      (next)="page.set(page() + 1)"
    />
  `,
  styleUrls: [
    '../admin.scss',
    './admin-evaluations.scss',
    '../../../shared/pager/_list-filters.scss',
  ],
})
export class EvaluationResults {
  protected readonly i18n = inject(I18n);

  readonly standings = input.required<EvaluationStanding[]>();
  /** Students with their mentorships and the mentorships to filter by; none hides the filter. */
  readonly students = input<{ uid: string; mentorshipIds: string[] }[]>([]);
  readonly mentorships = input<Mentorship[]>([]);

  protected readonly states: EvaluationStanding['status'][] = ['finished', 'active', 'notStarted'];
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly mentorship = signal('');
  protected readonly page = signal(0);

  protected readonly matches = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    const mentorship = this.mentorship();
    const members = mentorship ? new Set(membersOf(mentorship, this.students())) : null;
    return this.standings().filter(
      (row) =>
        (!term || row.name.toLowerCase().includes(term)) &&
        (!status || row.status === status) &&
        (!members || members.has(row.uid)),
    );
  });
  protected readonly pages = computed(() => pageCount(this.matches().length, RESULTS_PAGE_SIZE));
  protected readonly rows = computed(() => pageOf(this.matches(), this.page(), RESULTS_PAGE_SIZE));

  constructor() {
    // New results start on the first page.
    effect(() => {
      this.standings();
      this.page.set(0);
    });
  }

  protected filter(field: { set(value: string): void }, event: Event): void {
    field.set((event.target as HTMLInputElement | HTMLSelectElement).value);
    this.page.set(0);
  }
}
