import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { NewsDocument, NewsEvent, NewsInput } from '../../core/models/market-news';
import { Candle } from '../../core/models/practice';

/** News still to come that the chart may show past the last bar: two days ahead. */
const AHEAD_SECONDS = 2 * 86_400;
/** At most this many months are read for one chart (1,000 bars of 4h is about six). */
const MAX_MONTHS = 8;
/** Firestore batches take up to 500 writes. */
const BATCH = 450;

/** Month keys (`YYYY-MM`, UTC) from the one of `from` to the one of `to` (seconds). */
export function monthsBetween(from: number, to: number): string[] {
  const months: string[] = [];
  const day = new Date(from * 1000);
  const last = new Date(to * 1000).toISOString().slice(0, 7);
  let year = day.getUTCFullYear();
  let month = day.getUTCMonth();
  for (let guard = 0; guard < 600; guard++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (key > last) {
      break;
    }
    months.push(key);
    month = (month + 1) % 12;
    year += month === 0 ? 1 : 0;
  }
  return months;
}

/** First second of a month key and of the month after it (UTC). */
export function monthBounds(month: string): { start: number; end: number } {
  const [year, m] = month.split('-').map(Number);
  return { start: Date.UTC(year, m - 1, 1) / 1000, end: Date.UTC(year, m, 1) / 1000 };
}

function toEvent(id: string, data: Partial<NewsDocument>): NewsEvent {
  return {
    id,
    time: data.time ?? 0,
    name: data.name ?? '',
    country: data.country ?? 'US',
    impact: data.impact ?? 'medium',
    actual: data.actual ?? null,
    forecast: data.forecast ?? null,
    previous: data.previous ?? null,
  };
}

/**
 * INDAB's economic news calendar (`marketNews/{id}`): read month by month for the practice
 * chart, and kept by trainers and admins at `/admin/news`.
 */
@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly months = new Map<string, Promise<NewsEvent[]>>();

  /** The releases of a month (UTC), oldest first; none when the read fails. */
  month(key: string): Promise<NewsEvent[]> {
    let month = this.months.get(key);
    if (!month) {
      month = this.read(key).catch(() => {
        // Read again next time: the chart works without news meanwhile.
        this.months.delete(key);
        return [];
      });
      this.months.set(key, month);
    }
    return month;
  }

  private async read(key: string): Promise<NewsEvent[]> {
    const { start, end } = monthBounds(key);
    const snapshot = await getDocs(
      query(
        collection(this.firestore, 'marketNews'),
        where('time', '>=', start),
        where('time', '<', end),
        orderBy('time'),
      ),
    );
    return snapshot.docs.map((d) => toEvent(d.id, d.data() as Partial<NewsDocument>));
  }

  /**
   * The news around `candles` (from the first bar to two days past the last) while `enabled`;
   * reads again only when the bars reach another month. Call it in an injection context.
   */
  feed(candles: () => readonly Candle[], enabled: () => boolean = () => true): Signal<NewsEvent[]> {
    const keys = computed(() => {
      const bars = candles();
      if (!enabled() || !bars.length) {
        return '';
      }
      const months = monthsBetween(bars[0].time, bars[bars.length - 1].time + AHEAD_SECONDS);
      return months.slice(-MAX_MONTHS).join(',');
    });
    const events = signal<NewsEvent[]>([]);
    effect((onCleanup) => {
      const wanted = keys();
      if (!wanted) {
        events.set([]);
        return;
      }
      let stale = false;
      onCleanup(() => (stale = true));
      void Promise.all(wanted.split(',').map((key) => this.month(key))).then((months) => {
        if (!stale) {
          events.set(months.flat());
        }
      });
    });
    return events.asReadonly();
  }

  /** A month's releases, read again (for `/admin/news`). */
  async list(month: string): Promise<NewsEvent[]> {
    this.months.delete(month);
    return this.month(month);
  }

  private document(input: NewsInput) {
    return {
      time: input.time,
      name: input.name.trim(),
      country: input.country,
      impact: input.impact,
      actual: input.actual?.trim() || null,
      forecast: input.forecast?.trim() || null,
      previous: input.previous?.trim() || null,
      updatedBy: this.auth.user()!.uid,
      updatedAt: serverTimestamp(),
    };
  }

  /** Adds a release (no id) or saves changes to one. */
  async save(input: NewsInput, id?: string): Promise<string> {
    const ref = id
      ? doc(this.firestore, 'marketNews', id)
      : doc(collection(this.firestore, 'marketNews'));
    await setDoc(ref, this.document(input));
    this.months.clear();
    return ref.id;
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'marketNews', id));
    this.months.clear();
  }

  /**
   * Adds the releases of a schedule (the official dates) that are not in the calendar yet, by
   * their fixed ids, so loading it again never undoes what staff changed (a deleted one comes
   * back). Returns how many were added.
   */
  async importMissing(items: readonly (NewsInput & { id: string })[]): Promise<number> {
    if (!items.length) {
      return 0;
    }
    const times = items.map((item) => item.time);
    const months = monthsBetween(Math.min(...times), Math.max(...times));
    const existing = new Set<string>();
    for (const month of months) {
      for (const event of await this.read(month)) {
        existing.add(event.id);
      }
    }
    const missing = items.filter((item) => !existing.has(item.id));
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = writeBatch(this.firestore);
      for (const item of missing.slice(i, i + BATCH)) {
        batch.set(doc(this.firestore, 'marketNews', item.id), this.document(item));
      }
      await batch.commit();
    }
    this.months.clear();
    return missing.length;
  }
}
