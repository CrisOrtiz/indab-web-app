import { Component, computed, input, linkedSignal } from '@angular/core';

/** "María Fernández" → "MF", "ana@indab.co" → "A". */
export function initials(name: string): string {
  const words = name
    .split('@')[0]
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)!] : words;
  return letters.map((w) => [...w][0].toUpperCase()).join('') || '?';
}

/** Round profile photo, or the user's initials when there is none (or it fails to load). */
@Component({
  selector: 'app-avatar',
  template: `
    @if (photo() && !failed()) {
      <img [src]="photo()" alt="" [width]="size()" [height]="size()" (error)="failed.set(true)" />
    } @else {
      <span aria-hidden="true">{{ letters() }}</span>
    }
  `,
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.4',
  },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      overflow: hidden;
      border-radius: 50%;
      background: var(--color-accent);
      color: var(--color-accent-contrast);
      font-weight: 600;
      line-height: 1;
      user-select: none;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
})
export class Avatar {
  readonly photo = input<string | null | undefined>(null);
  readonly name = input('');
  readonly size = input(36);

  /** A broken photo falls back to initials until the photo changes. */
  protected readonly failed = linkedSignal({ source: this.photo, computation: () => false });
  protected readonly letters = computed(() => initials(this.name()));
}
