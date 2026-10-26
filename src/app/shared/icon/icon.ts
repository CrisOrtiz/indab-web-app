import { Component, computed, input } from '@angular/core';

/** Outline icons (24 px grid, 2 px stroke) drawn as inline SVG, so they need no download. */
export const ICONS = {
  plus: ['M12 5v14', 'M5 12h14'],
  edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
  copy: [
    'M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z',
    'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  ],
  trash: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    'M10 11v6',
    'M14 11v6',
  ],
  grade: [
    'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z',
    'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    'm9 14 2 2 4-4',
  ],
  results: ['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  eye: ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  eyeOff: [
    'M9.88 9.88a3 3 0 1 0 4.24 4.24',
    'M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68',
    'M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61',
    'M2 2l20 20',
  ],
  up: ['M12 19V5', 'm5 12 7-7 7 7'],
  down: ['M12 5v14', 'm19 12-7 7-7-7'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  play: ['M6 4v16l14-8Z'],
  pause: ['M8 5v14', 'M16 5v14'],
  users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  more: [
    'M13 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
    'M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
    'M13 19a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  ],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

/**
 * An icon, decorative: the button or link around it carries the accessible name
 * (`aria-label`) and the tooltip (`data-tip`, styled by `_icon-button.scss`).
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: ':host { display: inline-flex; flex: none; }',
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(18);

  protected readonly paths = computed(() => ICONS[this.name()]);
}
