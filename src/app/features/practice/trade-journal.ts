import { DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { PracticeTrade } from '../../core/models/practice';
import { JOURNAL_MIN_LENGTH } from '../ranking/score';
import { priceDigits } from './practice-format';
import { filledTrades } from './trade-boxes';

/** The longest journal entry, as the rules allow. */
export const JOURNAL_MAX_LENGTH = 280;

const finePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

/** One line of the journal: a trade, its number on the navigator (null while pending). */
interface JournalLine {
  trade: PracticeTrade;
  number: number | null;
}

/**
 * The trade journal of a session being played: one line per order with why it was entered
 * (setup, zone, confirmation). Each entry can be written or corrected, even after the trade
 * closed, until the session ends (Cris, 2026-11-11). In an evaluation it counts for the grade.
 */
@Component({
  selector: 'app-trade-journal',
  imports: [DecimalPipe],
  template: `
    @let t = i18n.messages().practice.journal;
    @let tr = i18n.messages().trading;
    @if (lines().length) {
      <section class="journal" [attr.aria-label]="t.title">
        <h3>{{ t.title }}</h3>
        <p class="hint">{{ graded() ? t.hintGraded(minLength) : t.hint }}</p>
        <ul>
          @for (line of lines(); track line.trade.id) {
            @let entry = draft(line.trade);
            <li [class.missing]="graded() && !written(line.trade)">
              <label [for]="'journal-' + line.trade.id">
                <strong>{{ line.number === null ? t.pending : t.trade(line.number) }}</strong>
                {{ tr.orderLabel(line.trade.side, line.trade.orderType) }}
                · {{ line.trade.entryPrice | number: digits(line.trade.entryPrice) }}
              </label>
              <div class="entry">
                <input
                  #field
                  type="text"
                  [id]="'journal-' + line.trade.id"
                  [attr.data-trade]="line.trade.id"
                  [attr.maxlength]="maxLength"
                  [placeholder]="t.placeholder"
                  [value]="entry"
                  (input)="edit(line.trade, $any($event.target).value)"
                  (keydown.enter)="save(line.trade)"
                />
                <button
                  type="button"
                  class="btn btn-outline small"
                  [disabled]="entry.trim() === (line.trade.journal ?? '').trim()"
                  (click)="save(line.trade)"
                >
                  {{ t.save }}
                </button>
              </div>
              @if (graded() && !written(line.trade)) {
                <small class="missing-note">{{ t.missing }}</small>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    .journal {
      margin-top: 12px;
      padding: 10px 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
    }

    h3 {
      margin: 0;
      font-size: 0.95rem;
    }

    .hint {
      margin: 2px 0 8px;
      color: var(--color-muted);
      font-size: 0.8rem;
    }

    ul {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    label {
      display: block;
      margin-bottom: 4px;
      font-size: 0.85rem;
    }

    .entry {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;

      input {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        padding: 6px 8px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-bg);
        color: var(--color-text);
        font: inherit;
        font-size: 16px;
      }
    }

    .missing input {
      border-color: var(--color-down);
    }

    .missing-note {
      display: block;
      margin-top: 2px;
      color: var(--color-down);
      font-size: 0.75rem;
    }
  `,
})
export class TradeJournal {
  protected readonly i18n = inject(I18n);

  /** Every trade of the session; cancelled orders are left out. */
  readonly trades = input.required<PracticeTrade[]>();
  /** An evaluation: entries count for the grade, so missing ones are pointed out. */
  readonly graded = input(false);
  /** A trade just placed, whose entry gets the focus. */
  readonly focus = input<string | null>(null);
  /** An entry to save, already trimmed. */
  readonly saved = output<{ trade: PracticeTrade; journal: string }>();

  protected readonly minLength = JOURNAL_MIN_LENGTH;
  protected readonly maxLength = JOURNAL_MAX_LENGTH;
  protected readonly digits = priceDigits;
  /** Text typed and not saved yet, by trade id. */
  private readonly drafts = signal<Record<string, string>>({});
  private readonly fields = viewChildren<ElementRef<HTMLInputElement>>('field');

  /** Filled trades numbered as the navigator shows them, then pending orders. */
  protected readonly lines = computed<JournalLine[]>(() => {
    const trades = this.trades();
    return [
      ...filledTrades(trades).map((trade, i) => ({ trade, number: i + 1 })),
      ...trades.filter((t) => t.status === 'pending').map((trade) => ({ trade, number: null })),
    ];
  });

  constructor() {
    // A trade just placed: its entry is ready to type in, with a mouse (on a phone the
    // keyboard would cover the chart).
    effect(() => {
      const id = this.focus();
      const field = this.fields().find((f) => f.nativeElement.dataset['trade'] === id);
      if (field && finePointer()) {
        field.nativeElement.focus({ preventScroll: true });
      }
    });
  }

  protected draft(trade: PracticeTrade): string {
    return this.drafts()[trade.id] ?? trade.journal ?? '';
  }

  protected written(trade: PracticeTrade): boolean {
    return (trade.journal ?? '').trim().length >= JOURNAL_MIN_LENGTH;
  }

  protected edit(trade: PracticeTrade, value: string): void {
    this.drafts.update((drafts) => ({ ...drafts, [trade.id]: value }));
  }

  protected save(trade: PracticeTrade): void {
    const journal = this.draft(trade).trim().slice(0, JOURNAL_MAX_LENGTH);
    if (journal === (trade.journal ?? '').trim()) {
      return;
    }
    this.saved.emit({ trade, journal });
    this.drafts.update(({ [trade.id]: _, ...rest }) => rest);
  }
}
