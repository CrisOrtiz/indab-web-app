import { Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n.service';
import {
  RUBRIC_CRITERIA,
  RubricCriterion,
  RubricScores,
  SavedRubricScores,
} from '../../../core/models/evaluation';

/** Scores 1 to 5 a mentor picks from. */
const SCALE = [1, 2, 3, 4, 5] as const;

/**
 * The mentor's rubric for one attempt: 1 to 5 on each fixed criterion. Saves only once every
 * criterion has a score.
 */
@Component({
  selector: 'app-rubric-form',
  template: `
    @let t = i18n.messages().evaluations.rubric;
    <form class="adjust rubric" (submit)="$event.preventDefault(); submit()">
      <h4>{{ t.title(studentName()) }}</h4>
      <p class="muted">{{ t.scale }}</p>
      @for (criterion of criteria; track criterion) {
        <fieldset>
          <legend>
            <strong>{{ t.criteria[criterion].label }}</strong>
            <span class="muted">{{ t.criteria[criterion].hint }}</span>
          </legend>
          <div class="scale" role="radiogroup" [attr.aria-label]="t.criteria[criterion].label">
            @for (value of scale; track value) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="scores()[criterion] === value"
                (click)="pick(criterion, value)"
              >
                {{ value }}
              </button>
            }
          </div>
        </fieldset>
      }
      @if (incomplete()) {
        <p class="message error" role="alert">{{ t.missing }}</p>
      }
      <div class="adjust-actions">
        <button type="submit" class="btn" [disabled]="busy()">{{ t.save }}</button>
        <button type="button" class="btn btn-outline" (click)="cancelled.emit()">
          {{ i18n.messages().evaluations.cancel }}
        </button>
      </div>
    </form>
  `,
  styleUrl: './admin-evaluations.scss',
  styles: `
    fieldset {
      margin: 0 0 12px;
      padding: 0;
      border: 0;
    }

    legend {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 6px;
      padding: 0;

      .muted {
        font-size: 0.85rem;
      }
    }

    .scale {
      display: flex;
      gap: 6px;

      button {
        width: 40px;
        height: 36px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-bg);
        color: var(--color-text);
        font: inherit;
        font-variant-numeric: tabular-nums;
        cursor: pointer;

        &[aria-checked='true'] {
          border-color: var(--color-text);
          background: var(--color-text);
          color: var(--color-bg);
        }
      }
    }
  `,
})
export class RubricForm {
  protected readonly i18n = inject(I18n);

  readonly studentName = input.required<string>();
  /** The rubric saved before, if any (one with older criteria keeps the ones still asked). */
  readonly initial = input<SavedRubricScores | null>(null);
  readonly busy = input(false);
  readonly saved = output<RubricScores>();
  readonly cancelled = output<void>();

  protected readonly criteria = RUBRIC_CRITERIA;
  protected readonly scale = SCALE;
  protected readonly scores = linkedSignal<Partial<RubricScores>>(() => {
    const initial = this.initial() ?? {};
    return Object.fromEntries(
      RUBRIC_CRITERIA.filter((c) => initial[c]).map((c) => [c, initial[c]]),
    ) as Partial<RubricScores>;
  });
  protected readonly incomplete = signal(false);

  protected pick(criterion: RubricCriterion, value: number): void {
    this.scores.update((scores) => ({ ...scores, [criterion]: value }));
    this.incomplete.set(false);
  }

  protected submit(): void {
    const scores = this.scores();
    if (RUBRIC_CRITERIA.some((c) => !scores[c])) {
      this.incomplete.set(true);
      return;
    }
    this.saved.emit(scores as RubricScores);
  }
}
