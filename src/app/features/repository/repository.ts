import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';
import {
  MATERIAL_KINDS,
  Material,
  MaterialKind,
  groupByCategory,
} from '../../core/models/material';
import { MaterialService } from './material.service';
import { MaterialThumb } from './material-thumb';

/**
 * The academy's study material (`/academy/material`): the videos, presentations, documents and
 * links staff shared with the student, grouped by topic, with a search, a type filter and a
 * topic filter. Each card opens the material's own page.
 */
@Component({
  selector: 'app-repository',
  imports: [MaterialThumb, RouterLink],
  templateUrl: './repository.html',
  styleUrl: './repository.scss',
})
export class Repository {
  private readonly service = inject(MaterialService);
  protected readonly i18n = inject(I18n);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly items = signal<Material[]>([]);

  protected readonly search = signal('');
  protected readonly kind = signal<MaterialKind | ''>('');
  protected readonly category = signal('');

  /** Types that have material, for the filter chips. */
  protected readonly kinds = computed(() => {
    const present = new Set(this.items().map((m) => m.kind));
    return MATERIAL_KINDS.filter((k) => present.has(k));
  });

  protected readonly categories = computed(() =>
    [
      ...new Set(
        this.items()
          .map((m) => m.category.trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es')),
  );

  protected readonly groups = computed(() => {
    const term = this.search().trim().toLowerCase();
    const kind = this.kind();
    const category = this.category();
    return groupByCategory(
      this.items().filter(
        (m) =>
          (!kind || m.kind === kind) &&
          (!category || m.category.trim() === category) &&
          (!term || `${m.title} ${m.category} ${m.description}`.toLowerCase().includes(term)),
      ),
    );
  });

  protected readonly shown = computed(() =>
    this.groups().reduce((total, g) => total + g.items.length, 0),
  );

  constructor() {
    void this.load();
  }

  protected clear(): void {
    this.search.set('');
    this.kind.set('');
    this.category.set('');
  }

  private async load(): Promise<void> {
    try {
      this.items.set(await this.service.visible());
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
