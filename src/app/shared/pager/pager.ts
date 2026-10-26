import { Component, inject, input, output } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';

/**
 * Previous / next buttons and the page number under a long list. `page` is zero-based; `pages`
 * (total) is known for lists in memory and unknown for cursor-paged Firestore queries, which
 * only know whether another page follows (`hasNext`).
 */
@Component({
  selector: 'app-pager',
  template: `
    @let t = i18n.messages().lists;
    @if (page() > 0 || hasNext()) {
      <nav class="pager" [attr.aria-label]="t.pagination">
        <button
          type="button"
          class="btn btn-outline small"
          [disabled]="page() === 0 || busy()"
          (click)="previous.emit()"
        >
          {{ t.previous }}
        </button>
        <span aria-live="polite">
          {{ pages() === null ? t.page(page() + 1) : t.pageOf(page() + 1, pages()!) }}
        </span>
        <button
          type="button"
          class="btn btn-outline small"
          [disabled]="!hasNext() || busy()"
          (click)="next.emit()"
        >
          {{ t.next }}
        </button>
      </nav>
    }
  `,
  styles: `
    .pager {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin: 16px 0;
      font-variant-numeric: tabular-nums;
    }

    .btn.small {
      padding: 4px 12px;
    }
  `,
})
export class Pager {
  protected readonly i18n = inject(I18n);

  readonly page = input.required<number>();
  readonly hasNext = input.required<boolean>();
  readonly pages = input<number | null>(null);
  /** Disables the buttons while a page loads. */
  readonly busy = input(false);

  readonly previous = output<void>();
  readonly next = output<void>();
}
