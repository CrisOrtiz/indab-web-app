import { Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';

/** A star outline in a 24×24 box. */
export const STAR_PATH =
  'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

/** Five stars, `value` of them filled (a review's rating), read as "4 de 5 estrellas". */
@Component({
  selector: 'app-stars',
  template: `
    @for (n of five; track n) {
      <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
        <path [attr.d]="star" [class.on]="n <= value()" />
      </svg>
    }
  `,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  styles: `
    :host {
      display: inline-flex;
      gap: 2px;
      vertical-align: middle;
    }

    path {
      fill: none;
      stroke: var(--color-star);
      stroke-width: 1.6;
      stroke-linejoin: round;
    }

    path.on {
      fill: var(--color-star);
    }
  `,
})
export class Stars {
  private readonly i18n = inject(I18n);

  readonly value = input.required<number>();
  readonly size = input(18);

  protected readonly five = [1, 2, 3, 4, 5];
  protected readonly star = STAR_PATH;
  protected readonly label = computed(() => this.i18n.messages().landing.rating(this.value()));
}
