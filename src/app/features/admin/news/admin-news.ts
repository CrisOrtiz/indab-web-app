import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18n } from '../../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { LoadingService } from '../../../core/loading/loading.service';
import {
  NEWS_COUNTRIES,
  NEWS_FIGURE_MAX,
  NEWS_IMPACTS,
  NEWS_NAME_MAX,
  NewsCountry,
  NewsEvent,
  NewsImpact,
  NewsInput,
  validNews,
} from '../../../core/models/market-news';
import { TimeZoneService } from '../../../core/time-zone/time-zone.service';
import { ActionsMenu, MenuAction } from '../../../shared/actions-menu/actions-menu';
import { Icon } from '../../../shared/icon/icon';
import { NewsService } from '../../practice/news.service';
import { fromLocalInput, toLocalInput } from '../exams/exam-form';
import { officialSchedule } from './official-schedule';

/** The release being added or edited, as typed. */
export interface NewsForm {
  id: string | null;
  /** `datetime-local` value in the staff member's time zone. */
  at: string;
  name: string;
  country: NewsCountry;
  impact: NewsImpact;
  actual: string;
  forecast: string;
  previous: string;
}

/** The month (`YYYY-MM`) a key is shifted to by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * `/admin/news` (trainers and admins): INDAB's own economic calendar, which the practice chart
 * shows. A month at a time; staff add, correct and delete releases, write their figures, and
 * load the official US schedules once (`officialSchedule`, nothing already there is touched).
 */
@Component({
  selector: 'app-admin-news',
  imports: [ActionsMenu, Icon, LocalDatePipe, RouterLink],
  templateUrl: './admin-news.html',
  styleUrls: ['../admin.scss', '../evaluations/admin-evaluations.scss', './admin-news.scss'],
})
export class AdminNews {
  private readonly service = inject(NewsService);
  private readonly loading = inject(LoadingService);
  private readonly zones = inject(TimeZoneService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly countries = NEWS_COUNTRIES;
  protected readonly impacts = NEWS_IMPACTS;
  protected readonly nameMax = NEWS_NAME_MAX;
  protected readonly figureMax = NEWS_FIGURE_MAX;

  protected readonly month = signal(new Date().toISOString().slice(0, 7));
  protected readonly events = signal<NewsEvent[]>([]);
  protected readonly loaded = signal(false);
  protected readonly form = signal<NewsForm | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  protected readonly confirmDelete = signal<NewsEvent | null>(null);

  protected readonly menu = computed<MenuAction[]>(() => {
    const t = this.i18n.messages().newsAdmin;
    return [
      { id: 'edit', label: t.edit, icon: 'edit' },
      { id: 'delete', label: t.delete, icon: 'trash', danger: true },
    ];
  });

  constructor() {
    effect(() => {
      const month = this.month();
      untracked(() => void this.load(month));
    });
  }

  private async load(month: string): Promise<void> {
    this.loaded.set(false);
    try {
      const events = await this.loading.track(this.service.list(month));
      if (month === this.month()) {
        this.events.set(events);
      }
    } finally {
      this.loaded.set(true);
    }
  }

  protected setMonth(value: string): void {
    if (/^\d{4}-\d{2}$/.test(value)) {
      this.month.set(value);
    }
  }

  protected shift(delta: number): void {
    this.month.update((month) => shiftMonth(month, delta));
  }

  protected create(): void {
    const day = new Date(`${this.month()}-01T12:30:00Z`);
    this.form.set({
      id: null,
      at: toLocalInput(day, this.zones.zone()),
      name: '',
      country: 'US',
      impact: 'high',
      actual: '',
      forecast: '',
      previous: '',
    });
  }

  protected edit(event: NewsEvent): void {
    this.form.set({
      id: event.id,
      at: toLocalInput(new Date(event.time * 1000), this.zones.zone()),
      name: event.name,
      country: event.country,
      impact: event.impact,
      actual: event.actual ?? '',
      forecast: event.forecast ?? '',
      previous: event.previous ?? '',
    });
  }

  protected patch(change: Partial<NewsForm>): void {
    this.form.update((form) => (form ? { ...form, ...change } : form));
  }

  protected act(event: NewsEvent, action: string): void {
    if (action === 'edit') {
      this.edit(event);
    } else if (action === 'delete') {
      this.confirmDelete.set(event);
    }
  }

  /** The form as a release, or null when something is missing or too long. */
  protected input(form: NewsForm): NewsInput | null {
    const time = form.at
      ? Math.floor(fromLocalInput(form.at, this.zones.zone()).getTime() / 1000)
      : NaN;
    const figure = (value: string) => value.trim() || null;
    const input: NewsInput = {
      time,
      name: form.name.trim(),
      country: form.country,
      impact: form.impact,
      actual: figure(form.actual),
      forecast: figure(form.forecast),
      previous: figure(form.previous),
    };
    return validNews(input) ? input : null;
  }

  protected async save(): Promise<void> {
    const form = this.form();
    const t = this.i18n.messages().newsAdmin;
    const input = form && this.input(form);
    if (!form || !input) {
      this.message.set({ kind: 'error', text: t.invalid });
      return;
    }
    this.busy.set(true);
    try {
      await this.service.save(input, form.id ?? undefined);
      this.form.set(null);
      this.message.set({ kind: 'ok', text: t.saved });
      // Show the month the release is in.
      const month = new Date(input.time * 1000).toISOString().slice(0, 7);
      if (month === this.month()) {
        await this.load(month);
      } else {
        this.month.set(month);
      }
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(event: NewsEvent): Promise<void> {
    const t = this.i18n.messages().newsAdmin;
    this.confirmDelete.set(null);
    this.busy.set(true);
    try {
      await this.service.remove(event.id);
      this.events.update((list) => list.filter((e) => e.id !== event.id));
      this.message.set({ kind: 'ok', text: t.deleted });
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    } finally {
      this.busy.set(false);
    }
  }

  /** Loads the official US schedules: only the releases not in the calendar yet. */
  protected async importOfficial(): Promise<void> {
    const t = this.i18n.messages().newsAdmin;
    this.busy.set(true);
    try {
      const added = await this.loading.track(this.service.importMissing(officialSchedule()));
      this.message.set({ kind: 'ok', text: t.imported(added) });
      await this.load(this.month());
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    } finally {
      this.busy.set(false);
    }
  }
}
