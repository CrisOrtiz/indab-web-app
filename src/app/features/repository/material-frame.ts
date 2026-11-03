import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { MaterialKind, materialEmbed } from '../../core/models/material';
import { Icon } from '../../shared/icon/icon';
import { MaterialThumb } from './material-thumb';
import { MaterialWatermark } from './material-watermark';

/**
 * Shows a material's link: its player or viewer inside the page for the sites `materialEmbed`
 * knows (built from the site's own address, so nothing else ever loads in the frame); anything
 * else gets a button that opens it in a new tab.
 *
 * Embedded material stays in the academy as far as a web page can keep it: the frame is
 * sandboxed without pop-ups or top navigation (the player's "watch on YouTube" and Drive's
 * pop-out do nothing), students get no link to the original (staff do), full screen covers our
 * frame instead of the player's so the watermark with the viewer's name and email stays on, and
 * right-click is off. Who can open the file at all is set where it lives (README "Protecting
 * the study material").
 */
@Component({
  selector: 'app-material-frame',
  imports: [Icon, MaterialThumb, MaterialWatermark],
  template: `
    @let t = i18n.messages().material;
    @if (embed(); as e) {
      @if (src(); as src) {
        <div
          #frame
          class="frame"
          [class.tall]="tall()"
          [class.expanded]="expanded()"
          (contextmenu)="$event.preventDefault()"
        >
          <!-- No allow-popups or allow-top-navigation: the player's own "watch on" and
               pop-out buttons cannot take the material out of the academy. -->
          <iframe
            [src]="src"
            [title]="t.frameTitle(title())"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
          <app-material-watermark />
          @if (expanded()) {
            <button
              type="button"
              class="btn exit"
              [attr.aria-label]="t.exitFullscreen"
              (click)="toggleFullscreen()"
            >
              <app-icon name="minimize" />{{ t.exitFullscreen }}
            </button>
          }
        </div>
        <p class="below">
          <button type="button" class="btn btn-outline" (click)="toggleFullscreen()">
            <app-icon [name]="expanded() ? 'minimize' : 'maximize'" />
            {{ expanded() ? t.exitFullscreen : t.fullscreen }}
          </button>
          @if (staff()) {
            <a class="btn btn-outline" [href]="url()" target="_blank" rel="noopener noreferrer">
              {{ t.openIn[e.provider] }} ↗
            </a>
            <span class="muted">{{ t.staffOnlyLink }}</span>
          } @else {
            <span class="muted">
              {{ google() ? t.googleAccess(email()) : t.notShowing }}
            </span>
          }
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

    // On phones without the Fullscreen API (iPhone) the frame fills the window instead.
    .frame.expanded,
    .frame:fullscreen {
      position: fixed;
      inset: 0;
      z-index: 1000;
      max-height: none;
      aspect-ratio: auto;
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 0;
      background: #000;
    }

    .frame {
      -webkit-touch-callout: none;
    }

    .exit {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 2;
    }

    .below .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
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
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  protected readonly i18n = inject(I18n);

  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');

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

  /** Trainers and admins get the original link; students only see the material here. */
  protected readonly staff = this.auth.isStaff;

  protected readonly email = computed(
    () => this.auth.profile()?.email || this.auth.user()?.email || '',
  );

  /** Google files may be shared only with the students' Google accounts. */
  protected readonly google = computed(() =>
    ['drive', 'slides', 'docs'].includes(this.embed()?.provider ?? ''),
  );

  /** True while the frame fills the screen (Fullscreen API or the window on iPhone). */
  protected readonly expanded = signal(false);

  constructor() {
    const onChange = () => this.expanded.set(!!this.document.fullscreenElement);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.expanded() && !this.document.fullscreenElement) {
        this.expanded.set(false);
      }
    };
    this.document.addEventListener('fullscreenchange', onChange);
    this.document.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('fullscreenchange', onChange);
      this.document.removeEventListener('keydown', onKey);
    });
  }

  protected toggleFullscreen(): void {
    const frame = this.frame()?.nativeElement;
    if (this.document.fullscreenElement) {
      void this.document.exitFullscreen();
      return;
    }
    if (this.expanded() || !frame) {
      this.expanded.set(false);
      return;
    }
    if (typeof frame.requestFullscreen === 'function') {
      frame.requestFullscreen().catch(() => this.expanded.set(true));
    } else {
      this.expanded.set(true);
    }
  }
}
