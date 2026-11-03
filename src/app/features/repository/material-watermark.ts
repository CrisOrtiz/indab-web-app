import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';

/** How often the marks move, so they cannot be cropped or covered in one place. */
export const WATERMARK_MOVE_MS = 20_000;

/** Rows and columns of marks laid over the player. */
const ROWS = 4;
const COLUMNS = 3;

/**
 * Faint, moving marks with the viewer's name and email over a material's player. Nothing on a
 * web page stops a screen recording, but a recording or a photo of the screen then says who it
 * came from. The marks let every click through to the player.
 */
@Component({
  selector: 'app-material-watermark',
  template: `
    @if (label(); as text) {
      <div class="marks" [style.transform]="shift()">
        @for (cell of cells; track cell) {
          <span>{{ text }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow: hidden;
      pointer-events: none;
      user-select: none;
    }

    .marks {
      position: absolute;
      inset: -20%;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(4, 1fr);
      place-items: center;
      transition: transform 2s ease-in-out;
    }

    span {
      transform: rotate(-24deg);
      color: rgb(255 255 255 / 0.26);
      font-size: clamp(0.65rem, 1.6vw, 0.95rem);
      font-weight: 600;
      white-space: nowrap;
      text-shadow: 0 0 2px rgb(0 0 0 / 0.35);
    }

    @media (prefers-reduced-motion: reduce) {
      .marks {
        transition: none;
      }
    }
  `,
})
export class MaterialWatermark {
  private readonly auth = inject(AuthService);

  protected readonly cells = Array.from({ length: ROWS * COLUMNS }, (_, i) => i);

  /** "Name · email" of whoever is signed in. */
  protected readonly label = computed(() => {
    const user = this.auth.user();
    const email = this.auth.profile()?.email || user?.email || '';
    const name = this.auth.profile()?.displayName || user?.displayName || '';
    return [name, email].filter(Boolean).join(' · ');
  });

  protected readonly shift = signal('translate(0, 0)');

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }
    const timer = setInterval(() => {
      const x = Math.round((Math.random() - 0.5) * 24);
      const y = Math.round((Math.random() - 0.5) * 24);
      this.shift.set(`translate(${x}%, ${y}%)`);
    }, WATERMARK_MOVE_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
