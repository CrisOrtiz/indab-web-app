import { Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { PracticeSession } from '../../core/models/practice';
import { SessionFilters } from './practice.service';

/** `''` for any; `free` for free practice; otherwise an evaluation id. */
type Kind = '' | 'free' | (string & {});

/** A `YYYY-MM-DD` date input's value as local midnight, `days` later. */
export function dayStart(value: string, days = 0): Date | undefined {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d + days) : undefined;
}

/**
 * The filters above a list of practice sessions: student (staff only, when `students` is
 * given), free practice or one evaluation, status and a date range on the start. Emits the
 * filters for `PracticeService.sessionsPage` on every change.
 */
@Component({
  selector: 'app-session-filters',
  template: `
    @let t = i18n.messages().lists;
    @let tr = i18n.messages().trading;
    <div class="list-filters" role="group" [attr.aria-label]="t.filters">
      @if (students().length) {
        <label>
          {{ t.student }}
          <select [value]="student()" (change)="set(student, $event)">
            <option value="">{{ t.allStudents }}</option>
            @for (s of students(); track s.uid) {
              <option [value]="s.uid">{{ s.name }}</option>
            }
          </select>
        </label>
      }
      <label>
        {{ t.kind }}
        <select [value]="kind()" (change)="set(kind, $event)">
          <option value="">{{ t.allKinds }}</option>
          <option value="free">{{ t.free }}</option>
          @if (evaluations().length) {
            <optgroup [label]="t.evaluations">
              @for (e of evaluations(); track e.id) {
                <option [value]="e.id">{{ e.title }}</option>
              }
            </optgroup>
          }
        </select>
      </label>
      <label>
        {{ t.status }}
        <select [value]="status()" (change)="set(status, $event)">
          <option value="">{{ t.allStatuses }}</option>
          <option value="active">{{ tr.active }}</option>
          <option value="finished">{{ tr.finished }}</option>
        </select>
      </label>
      <label>
        {{ t.from }}
        <input type="date" [value]="from()" [max]="to()" (change)="set(from, $event)" />
      </label>
      <label>
        {{ t.to }}
        <input type="date" [value]="to()" [min]="from()" (change)="set(to, $event)" />
      </label>
      @if (active()) {
        <button type="button" class="btn btn-outline clear" (click)="clear()">
          {{ t.clear }}
        </button>
      }
    </div>
  `,
  styleUrl: '../../shared/pager/_list-filters.scss',
})
export class SessionFilterBar {
  protected readonly i18n = inject(I18n);

  /** Students to pick from; none hides the student filter (a student's own list). */
  readonly students = input<{ uid: string; name: string }[]>([]);
  readonly evaluations = input<{ id: string; title: string }[]>([]);
  readonly filtersChange = output<SessionFilters>();

  protected readonly student = signal('');
  protected readonly kind = signal<Kind>('');
  protected readonly status = signal<'' | PracticeSession['status']>('');
  protected readonly from = signal('');
  protected readonly to = signal('');

  protected readonly active = computed(
    () => !!(this.student() || this.kind() || this.status() || this.from() || this.to()),
  );

  /** The filters as `PracticeService` takes them; `to` includes that whole day. */
  readonly value = computed<SessionFilters>(() => {
    const kind = this.kind();
    return {
      ...(this.student() ? { uid: this.student() } : {}),
      ...(kind ? { evaluationId: kind === 'free' ? null : kind } : {}),
      ...(this.status() ? { status: this.status() as PracticeSession['status'] } : {}),
      ...(this.from() ? { from: dayStart(this.from()) } : {}),
      ...(this.to() ? { to: dayStart(this.to(), 1) } : {}),
    };
  });

  protected set(field: { set(value: string): void }, event: Event): void {
    field.set((event.target as HTMLInputElement | HTMLSelectElement).value);
    this.filtersChange.emit(this.value());
  }

  protected clear(): void {
    for (const field of [this.student, this.kind, this.status, this.from, this.to]) {
      field.set('');
    }
    this.filtersChange.emit(this.value());
  }
}
