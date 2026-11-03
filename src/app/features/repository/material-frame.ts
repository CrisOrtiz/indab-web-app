import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { I18n } from '../../core/i18n/i18n.service';
import { MaterialKind, materialEmbed } from '../../core/models/material';
import { MaterialThumb } from './material-thumb';

/**
 * Shows a material's link: its player or viewer inside the page for the sites `materialEmbed`
 * knows (built from the site's own address, so nothing else ever loads in the frame), with a
 * link to open it on the site; anything else gets a button that opens it in a new tab.
 */
@Component({
  selector: 'app-material-frame',
  imports: [MaterialThumb],
  template: `
    @let t = i18n.messages().material;
    @if (embed(); as e) {
      @if (src(); as src) {
        <div class="frame" [class.tall]="tall()">
          <iframe
            [src]="src"
            [title]="t.frameTitle(title())"
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        </div>
        <p class="below">
          <a class="btn btn-outline" [href]="url()" target="_blank" rel="noopener noreferrer">
            {{ t.openIn[e.provider] }} ↗
          </a>
          <span class="muted">{{ t.notShowing }}</span>
        </p>
      } @else {
        <div class="external">
          <app-material-thumb [url]="url()" [kind]="kind()" />
          <p class="muted">{{ t.externalOnly }}</p>
          <a class="btn" [href]="url()" target="_blank" rel="noopener noreferrer">
            {{ t.openIn[e.provider] }} ↗
          </a>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .frame {
      position: relative;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-band);

      &.tall {
        // Documents read better taller; keep them inside the screen.
        aspect-ratio: 4 / 5;
        max-height: 80vh;
        width: 100%;
      }
    }

    iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }

    .below {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin: 12px 0 0;
      font-size: 0.9rem;
    }

    .muted {
      color: var(--color-muted);
    }

    .external {
      display: grid;
      justify-items: start;
      gap: 12px;
      max-width: 480px;

      app-material-thumb {
        width: 100%;
      }

      p {
        margin: 0;
      }
    }
  `,
})
export class MaterialFrame {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly i18n = inject(I18n);

  readonly url = input.required<string>();
  readonly title = input.required<string>();
  readonly kind = input.required<MaterialKind>();

  protected readonly embed = computed(() => materialEmbed(this.url()));

  /** Only addresses built by `materialEmbed` from known sites are trusted for the frame. */
  protected readonly src = computed<SafeResourceUrl | null>(() => {
    const url = this.embed()?.embedUrl;
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  /** Documents (Drive files, Docs) get a taller frame than videos and slides. */
  protected readonly tall = computed(() => {
    const provider = this.embed()?.provider;
    return provider === 'docs' || (provider === 'drive' && this.kind() === 'document');
  });
}
