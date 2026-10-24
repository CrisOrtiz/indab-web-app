import { Component, input } from '@angular/core';
import { Language } from '../../core/i18n/i18n.service';

// US flag: 13 stripes of 16/13 units on a 24x16 canvas, and a grid of dots for the stars.
const STRIPE = 16 / 13;
const WHITE_STRIPES = [1, 3, 5, 7, 9, 11].map((i) => i * STRIPE);
const STARS = [1.6, 4.3, 7].flatMap((y, row) =>
  [1.4, 3.6, 5.8, 8].map((x) => ({ x: row % 2 ? x + 0.6 : x, y })),
);

/**
 * Flag of each site language: Mexico for Latin American Spanish, the USA for English and Brazil
 * for Portuguese. Inline SVG, because Windows shows flag emoji as letters. Decorative: the
 * language name is always next to it or in the button's label.
 */
@Component({
  selector: 'app-flag',
  template: `
    <svg viewBox="0 0 24 16" aria-hidden="true" focusable="false">
      @switch (language()) {
        @case ('es-419') {
          <rect width="8" height="16" fill="#006847" />
          <rect x="8" width="8" height="16" fill="#fff" />
          <rect x="16" width="8" height="16" fill="#ce1126" />
          <circle cx="12" cy="7.6" r="2" fill="#8c5a2b" />
          <path d="M9.6 8.4a2.4 2.4 0 0 0 4.8 0" fill="none" stroke="#006847" stroke-width="0.8" />
        }
        @case ('en-US') {
          <rect width="24" height="16" fill="#b22234" />
          @for (y of whiteStripes; track y) {
            <rect [attr.y]="y" width="24" [attr.height]="stripe" fill="#fff" />
          }
          <rect width="9.6" [attr.height]="stripe * 7" fill="#3c3b6e" />
          @for (star of stars; track $index) {
            <circle [attr.cx]="star.x" [attr.cy]="star.y" r="0.45" fill="#fff" />
          }
        }
        @case ('pt-BR') {
          <rect width="24" height="16" fill="#009c3b" />
          <path d="M12 1.6 22 8 12 14.4 2 8z" fill="#ffdf00" />
          <circle cx="12" cy="8" r="3.6" fill="#002776" />
          <path d="M8.5 7.1c2.3-.5 4.8-.1 6.9 1.2" fill="none" stroke="#fff" stroke-width="0.7" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    svg {
      display: block;
      width: 24px;
      height: 16px;
      border-radius: 3px;
      // A hairline keeps the white parts visible on white.
      box-shadow: 0 0 0 1px rgb(0 0 0 / 12%);
    }
  `,
})
export class Flag {
  readonly language = input.required<Language>();
  protected readonly stripe = STRIPE;
  protected readonly whiteStripes = WHITE_STRIPES;
  protected readonly stars = STARS;
}
