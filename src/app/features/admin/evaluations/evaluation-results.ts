import { DecimalPipe, PercentPipe } from '@angular/common';
import {
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ActionsMenu, MenuAction } from '../../../shared/actions-menu/actions-menu';
import { I18n } from '../../../core/i18n/i18n.service';
import { Mentorship, membersOf } from '../../../core/models/mentorship';
import { MentorshipFilter } from '../audience/mentorship-filter';
import { Pager } from '../../../shared/pager/pager';
import { pageCount, pageOf } from '../../../shared/pager/cursor-pages';
import { rubricAverage } from '../../../core/models/evaluation';
import { faultsOf } from '../../ranking/discipline';
import { scoreDetails } from '../../ranking/score-details';
import { EvaluationStanding, ShownScore } from '../../ranking/standings';

/** Students per page of results. */
export const RESULTS_PAGE_SIZE = 20;

/**
 * An evaluation's ranking for trainers and admins, with a name search, a status filter and
 * pages. Every attempt is already loaded (one per assigned student, needed to rank them), so
 * filtering keeps each student's place in the full ranking.
 */
@Component({
  selector: 'app-evaluation-results',
  imports: [ActionsMenu, DecimalPipe, MentorshipFilter, Pager, PercentPipe],
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
    @let ts = i18n.messages().stats;
    <div class="chips result-views" role="group" [attr.aria-label]="t.resultsView">
      <button
        type="button"
        [attr.aria-pressed]="view() === 'ranking'"
        (click)="view.set('ranking')"
      >
        {{ t.viewRanking }}
      </button>
      <button
        type="button"
        [attr.aria-pressed]="view() === 'metrics'"
        (click)="view.set('metrics')"
      >
        {{ t.viewMetrics }}
      </button>
    </div>
    @if (view() === 'ranking') {
      <p class="muted score-how">{{ t.score.how }}</p>
    }
    <table class="users results">
      <thead>
        <tr>
          <th>#</th>
          <th>{{ t.student }}</th>
          @if (view() === 'ranking') {
            <th>{{ t.score.column }}</th>
            <th>{{ t.status }}</th>
            <th>{{ t.pnl }}</th>
            <th>{{ t.return }}</th>
            <th>{{ t.trades }}</th>
            <th>{{ t.rubric.column }}</th>
          } @else {
            <th>{{ ts.maxDrawdown }}</th>
            <th>{{ ts.profitFactor }}</th>
            <th>{{ ts.winRate }}</th>
            <th>{{ ts.riskPerTrade }}</th>
            <th>{{ ts.rewardRisk }}</th>
            <th>{{ ts.withoutStopLoss }}</th>
            <th>{{ ts.faultCount }}</th>
            <th>{{ ts.stopOut }}</th>
          }
          <th [attr.aria-label]="t.adjustments"></th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.uid) {
          <tr>
            <td data-label="#">{{ row.rank ?? '—' }}</td>
            <td [attr.data-label]="t.student" class="name">{{ row.name }}</td>
            @if (view() === 'metrics') {
              @let m = row.stats;
              <td [attr.data-label]="ts.maxDrawdown" [class.down]="(m?.maxDrawdown ?? 0) > 0">
                {{ m ? (m.maxDrawdownPct | percent: '1.1-1') : '—' }}
              </td>
              <td [attr.data-label]="ts.profitFactor">
                {{ m?.profitFactor == null ? '—' : (m!.profitFactor | number: '1.2-2') }}
              </td>
              <td [attr.data-label]="ts.winRate">
                {{ m?.winRate == null ? '—' : (m!.winRate | percent: '1.0-0') }}
              </td>
              <td [attr.data-label]="ts.riskPerTrade">
                @if (m?.avgRiskPct == null) {
                  —
                } @else {
                  {{ m!.avgRiskPct | percent: '1.1-1' }}
                  <small class="muted">{{
                    ts.riskMax((m!.maxRiskPct | percent: '1.1-1') ?? '')
                  }}</small>
                }
              </td>
              <td [attr.data-label]="ts.rewardRisk">
                {{ m?.avgRewardRisk == null ? '—' : '1:' + (m!.avgRewardRisk | number: '1.0-2') }}
              </td>
              <td
                [attr.data-label]="ts.withoutStopLoss"
                [class.down]="(m?.withoutStopLoss ?? 0) > 0"
              >
                {{ m ? m.withoutStopLoss : '—' }}
              </td>
              @let faults = faultCount(row);
              <td
                [attr.data-label]="ts.faultCount"
                [class.down]="(faults ?? 0) > 0"
                [attr.title]="faultList(row)"
              >
                {{ faults ?? '—' }}
              </td>
              <td [attr.data-label]="ts.stopOut" [class.down]="!!m?.stoppedOut">
                {{ m ? (m.stoppedOut ? ts.stopOutYes : ts.stopOutNo) : '—' }}
              </td>
            } @else {
              <td
                [attr.data-label]="t.score.column"
                class="score"
                [attr.title]="row.score ? partsOf(row.score) : null"
              >
                @if (row.score; as sc) {
                  @if (sc.verdict !== 'unrated') {
                    <strong>{{ sc.score | number: '1.1-1' }}</strong>
                  }
                  @if (sc.verdict) {
                    <span class="verdict" [attr.data-verdict]="sc.verdict">{{
                      t.score.verdicts[sc.verdict]
                    }}</span>
                  }
                } @else if (row.sessionId) {
                  <span class="muted">{{ t.score.missing }}</span>
                } @else {
                  —
                }
              </td>
              <td [attr.data-label]="t.status">
                {{ t.attemptStates[row.status] }}
                @if (row.extraMinutes) {
                  <span class="badge">{{ t.extraBadge(row.extraMinutes) }}</span>
                }
              </td>
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
              <td [attr.data-label]="t.rubric.column">
                {{
                  row.rubric ? t.rubric.average((average(row.rubric) | number: '1.1-1') ?? '') : '—'
                }}
              </td>
            }
            <td class="row-actions">
              @let actions = menus().get(row.uid) ?? [];
              @if (actions.length) {
                <app-actions-menu
                  [actions]="actions"
                  [label]="t.attemptActions(row.name)"
                  (picked)="adjust.emit({ row, kind: $any($event) })"
                />
              }
            </td>
          </tr>
        } @empty {
          <tr>
            <td [attr.colspan]="view() === 'ranking' ? 9 : 11" class="muted empty">
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
  styles: `
    .result-views {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;

      button {
        padding: 6px 14px;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background: var(--color-bg);
        color: var(--color-text);
        font: inherit;
        cursor: pointer;

        &[aria-pressed='true'] {
          border-color: var(--color-text);
          background: var(--color-text);
          color: var(--color-bg);
        }
      }
    }

    .verdict {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 8px;
      border-radius: 999px;
      border: 1px solid currentColor;
      font-size: 0.75rem;
      white-space: nowrap;

      &[data-verdict='passed'] {
        color: var(--color-up);
      }

      &[data-verdict='failed'] {
        color: var(--color-down);
      }

      &[data-verdict='unrated'] {
        color: var(--color-muted);
      }
    }

    .score-how {
      margin: 0 0 8px;
      font-size: 0.85rem;
    }

    td small {
      display: block;
      font-size: 0.75rem;
    }
  `,
})
export class EvaluationResults {
  protected readonly i18n = inject(I18n);

  readonly standings = input.required<EvaluationStanding[]>();
  /** Students with their mentorships and the mentorships to filter by; none hides the filter. */
  readonly students = input<{ uid: string; mentorshipIds: string[] }[]>([]);
  readonly mentorships = input<Mentorship[]>([]);
  /** Staff picked "add minutes" or "restart" on an attempt. */
  readonly adjust = output<{ row: EvaluationStanding; kind: 'extraTime' | 'reset' | 'rubric' }>();

  protected readonly states: EvaluationStanding['status'][] = ['finished', 'active', 'notStarted'];
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly mentorship = signal('');
  protected readonly page = signal(0);
  /** The ranking (P/L) or how each attempt traded (risk, drawdown...). */
  protected readonly view = signal<'ranking' | 'metrics'>('ranking');
  protected readonly average = rubricAverage;

  /** A score's parts and, when it failed by a rule or is unrated, why; for its tooltip. */
  protected partsOf(score: ShownScore): string | null {
    return scoreDetails(
      this.i18n.messages().evaluations.score,
      score,
      (value) => this.decimal.transform(value, '1.0-1') ?? '',
    );
  }

  /** How many discipline faults an attempt's trades show; null when they are not loaded. */
  protected faultCount(row: EvaluationStanding): number | null {
    return row.marks ? faultsOf(row.marks).length : null;
  }

  /** An attempt's faults, one per line, for the tooltip. */
  protected faultList(row: EvaluationStanding): string | null {
    const ts = this.i18n.messages().stats;
    const faults = row.marks ? faultsOf(row.marks) : [];
    return faults.length
      ? faults.map((f) => ts.markLine(f.trade, ts.marks[f.kind])).join('\n')
      : null;
  }
  private readonly decimal = new DecimalPipe(inject(LOCALE_ID));

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
  /** Each row's menu, by student. */
  protected readonly menus = computed(
    () => new Map(this.rows().map((row) => [row.uid, this.actionsFor(row)])),
  );

  constructor() {
    // New results start on the first page.
    effect(() => {
      this.standings();
      this.page.set(0);
    });
  }

  /** A row's menu: minutes for an open attempt; rate or restart any attempt taken. */
  private actionsFor(row: EvaluationStanding): MenuAction[] {
    const t = this.i18n.messages().evaluations;
    return [
      ...(row.open ? [{ id: 'extraTime', label: t.giveExtraTime, icon: 'clock' as const }] : []),
      ...(row.sessionId ? [{ id: 'rubric', label: t.rubric.rate, icon: 'grade' as const }] : []),
      ...(row.sessionId
        ? [{ id: 'reset', label: t.resetAttempt, icon: 'restart' as const, danger: true }]
        : []),
    ];
  }

  protected filter(field: { set(value: string): void }, event: Event): void {
    field.set((event.target as HTMLInputElement | HTMLSelectElement).value);
    this.page.set(0);
  }
}
