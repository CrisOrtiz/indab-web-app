import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { Material } from '../../core/models/material';
import { MaterialFrame } from './material-frame';
import { MaterialService } from './material.service';

/** One piece of study material (`/academy/material/:id`): its player or viewer and its notes. */
@Component({
  selector: 'app-material-view',
  imports: [LocalDatePipe, MaterialFrame, RouterLink],
  template: `
    @let t = i18n.messages().material;
    <section class="container">
      <a routerLink="/academy/material" class="back">{{ t.back }}</a>
      @if (loading()) {
        <p class="muted">{{ t.loading }}</p>
      } @else if (material(); as m) {
        <header>
          <p class="meta">
            <span class="kind">{{ t.kinds[m.kind] }}</span>
            @if (m.category) {
              <span>{{ m.category }}</span>
            }
            @if (!m.published) {
              <span class="draft">{{ i18n.messages().materialAdmin.draft }}</span>
            }
          </p>
          <h1>{{ m.title }}</h1>
        </header>
        <app-material-frame [url]="m.url" [title]="m.title" [kind]="m.kind" />
        @if (m.description) {
          <p class="description">{{ m.description }}</p>
        }
        @if (m.createdAt; as created) {
          <p class="muted added">{{ t.added((created.toDate() | localDate: 'd MMM y') ?? '') }}</p>
        }
      } @else {
        <p class="muted" role="alert">{{ t.notFound }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding: 32px 0 56px;
    }

    .back {
      display: inline-block;
      margin-bottom: 16px;
      color: var(--color-muted);
    }

    header {
      margin-bottom: 16px;
    }

    h1 {
      margin: 4px 0 0;
      font-size: clamp(1.4rem, 3.5vw, 2rem);
      overflow-wrap: anywhere;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      margin: 0;
      color: var(--color-muted);
      font-size: 0.85rem;
    }

    .kind {
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .draft {
      padding: 0 8px;
      border: 1px solid var(--color-border);
      border-radius: 999px;
    }

    .description {
      max-width: 760px;
      margin: 24px 0 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }

    .muted {
      color: var(--color-muted);
    }

    .added {
      font-size: 0.85rem;
    }
  `,
})
export class MaterialView {
  private readonly service = inject(MaterialService);
  protected readonly i18n = inject(I18n);

  /** Route parameter. */
  readonly id = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly material = signal<Material | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.material.set(await this.service.get(id));
    this.loading.set(false);
  }
}
