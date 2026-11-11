import {
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { Evaluation } from '../../core/models/evaluation';
import { formatElapsed } from './bars';
import { marketCovered } from './live';
import { LOSS_LIMIT, MIN_TRADES } from '../ranking/score';
import { LEVERAGE, STARTING_BALANCE, STOP_OUT_LEVEL } from './replay';

/**
 * What a student reads before starting an evaluation's one attempt: how long it lasts, how
 * the chart moves, the account, what happens on leaving and at the end, and how it is graded.
 * Starts only once the student says they read it.
 */
@Component({
  selector: 'app-evaluation-briefing',
  template: `
    @let t = i18n.messages().practice.briefing;
    @let ev = evaluation();
    <div class="backdrop" (click)="cancelled.emit()"></div>
    <div
      class="briefing"
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-title"
      (keydown.escape)="cancelled.emit()"
    >
      <h2 id="briefing-title">{{ t.title(ev.title) }}</h2>
      @if (ev.description) {
        <p class="description">{{ ev.description }}</p>
      }

      <h3>{{ t.howTitle }}</h3>
      <ul>
        <li>{{ t.oneAttempt(ev.durationMinutes) }}</li>
        @if (ev.pace) {
          <li>{{ t.live(paceText(ev.pace), covered(ev)) }}</li>
        } @else {
          <li>{{ t.freeSpeed }}</li>
        }
        <li>{{ t.account(ev.startingBalance || startingBalance, leverage, stopOut) }}</li>
        @if (ev.hideDates) {
          <li>{{ t.hiddenDates }}</li>
        }
        <li>{{ t.leaving }}</li>
        <li>{{ t.end }}</li>
        <li>{{ t.warnings }}</li>
      </ul>

      <h3>{{ t.gradeTitle }}</h3>
      <p>{{ t.grade }}</p>
      <ul>
        <li>{{ t.tipStop }}</li>
        <li>{{ t.tipRisk }}</li>
        <li>{{ t.tipDiscipline }}</li>
        <li>{{ t.tipFail(lossLimit) }}</li>
        <li>{{ t.tipMin(minTrades) }}</li>
      </ul>

      <label class="read">
        <input
          type="checkbox"
          [checked]="read()"
          (change)="read.set($any($event.target).checked)"
        />
        {{ t.read }}
      </label>
      <div class="actions">
        <button #start type="button" class="btn" [disabled]="!read()" (click)="started.emit()">
          {{ t.start }}
        </button>
        <button type="button" class="btn btn-outline" (click)="cancelled.emit()">
          {{ t.cancel }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: grid;
      place-items: center;
      padding: 16px;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 0.5);
    }

    .briefing {
      position: relative;
      width: min(560px, 100%);
      max-height: calc(100dvh - 32px);
      overflow-y: auto;
      padding: 20px 22px;
      border-radius: var(--radius);
      background: var(--color-bg);
      color: var(--color-text);
      box-shadow: 0 12px 40px rgb(0 0 0 / 0.3);
    }

    h2 {
      margin: 0 0 8px;
      font-size: 1.25rem;
    }

    h3 {
      margin: 16px 0 6px;
      font-size: 1rem;
    }

    .description {
      margin: 0 0 4px;
      color: var(--color-muted);
      white-space: pre-line;
    }

    ul {
      display: grid;
      gap: 6px;
      margin: 0;
      padding-left: 20px;
    }

    p {
      margin: 0 0 6px;
    }

    .read {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 18px 0 12px;
      font-weight: 600;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class EvaluationBriefing {
  protected readonly i18n = inject(I18n);

  readonly evaluation = input.required<Evaluation>();
  readonly started = output<void>();
  readonly cancelled = output<void>();

  protected readonly read = signal(false);
  protected readonly startingBalance = STARTING_BALANCE;
  protected readonly leverage = LEVERAGE;
  protected readonly stopOut = STOP_OUT_LEVEL * 100;
  protected readonly lossLimit = Math.round(LOSS_LIMIT * 100);
  protected readonly minTrades = MIN_TRADES;
  private readonly startButton = viewChild<ElementRef<HTMLButtonElement>>('start');

  constructor() {
    // Focus moves into the dialog, on its checkbox, so the keyboard starts there.
    afterNextRender(() => {
      this.startButton()
        ?.nativeElement.closest('.briefing')
        ?.querySelector<HTMLInputElement>('input')
        ?.focus();
    });
  }

  protected paceText(pace: number): string {
    return this.i18n.messages().evaluations.paces[pace] ?? '';
  }

  protected covered(evaluation: Evaluation): string {
    return formatElapsed(marketCovered(evaluation.pace!, evaluation.durationMinutes));
  }
}
