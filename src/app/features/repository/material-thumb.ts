import { Component, computed, input } from '@angular/core';
import { MaterialKind, materialEmbed } from '../../core/models/material';

/**
 * A material's picture on its card: YouTube's own preview when there is one, otherwise a
 * drawing of its kind on the brand's black band.
 */
@Component({
  selector: 'app-material-thumb',
  template: `
    @if (picture(); as src) {
      <img [src]="src" alt="" loading="lazy" referrerpolicy="no-referrer" />
      @if (kind() === 'video') {
        <span class="play" aria-hidden="true"></span>
      }
    } @else {
      <svg viewBox="0 0 96 72" aria-hidden="true">
        @switch (kind()) {
          @case ('video') {
            <rect class="outline" x="8" y="10" width="80" height="52" rx="8" />
            <path class="solid" d="M40 24v24l20-12z" />
          }
          @case ('presentation') {
            <rect class="outline" x="10" y="8" width="76" height="44" rx="4" />
            <path d="M48 52v12M36 66l12-6 12 6" />
            <path class="solid" d="M22 40h8V30h-8zM36 40h8V22h-8zM50 40h8V26h-8z" />
            <path class="thin" d="M66 22h12M66 30h12M66 38h8" />
          }
          @case ('document') {
            <path class="outline" d="M24 6h34l16 16v44H24z" />
            <path d="M58 6v16h16" />
            <path class="thin" d="M34 34h30M34 44h30M34 54h20" />
          }
          @default {
            <path d="M42 42a12 12 0 0 0 17 0l10-10a12 12 0 0 0-17-17l-4 4" />
            <path d="M54 30a12 12 0 0 0-17 0L27 40a12 12 0 0 0 17 17l4-4" />
          }
        }
      </svg>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: grid;
      place-items: center;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-radius: var(--radius);
      background:
        radial-gradient(circle at 80% 20%, rgb(255 255 255 / 14%), transparent 55%),
        var(--color-band);
      color: var(--color-band-text);
    }

    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .play {
      position: relative;
      width: 56px;
      height: 40px;
      border-radius: 12px;
      background: rgb(0 0 0 / 70%);

      &::after {
        content: '';
        position: absolute;
        top: 12px;
        left: 22px;
        border-style: solid;
        border-width: 8px 0 8px 14px;
        border-color: transparent transparent transparent #fff;
      }
    }

    svg {
      width: 40%;
      max-width: 112px;
      fill: none;
      stroke: currentColor;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .solid {
      fill: currentColor;
      stroke: none;
    }

    .thin {
      stroke-width: 2;
      opacity: 0.7;
    }
  `,
})
export class MaterialThumb {
  readonly url = input.required<string>();
  readonly kind = input.required<MaterialKind>();

  protected readonly picture = computed(() => materialEmbed(this.url())?.thumbnailUrl ?? null);
}
