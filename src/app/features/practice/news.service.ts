import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { MarketNewsMonth, NewsEvent, monthsBetween } from '../../core/models/market-news';
import { Candle } from '../../core/models/practice';

/** News still to come that the chart may show past the last bar: two days ahead. */
const AHEAD_SECONDS = 2 * 86_400;
/** At most this many months are read for one chart (1,000 bars of 4h is about six). */
const MAX_MONTHS = 8;

/**
 * Economic news for the practice chart, from `marketNews/{YYYY-MM}` (copied daily from
 * Finance Calendar by a GitHub Actions job). Each month is read once per visit.
 */
@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly firestore = inject(FIRESTORE);
  private readonly months = new Map<string, Promise<NewsEvent[]>>();

  /** The releases of a month; none when it was never copied or the read fails. */
  month(key: string): Promise<NewsEvent[]> {
    let month = this.months.get(key);
    if (!month) {
      month = getDoc(doc(this.firestore, 'marketNews', key)).then(
        (snapshot) => {
          const events = (snapshot.data() as Partial<MarketNewsMonth> | undefined)?.events;
          return Array.isArray(events) ? events : [];
        },
        () => {
          // Read again next time: the chart works without news meanwhile.
          this.months.delete(key);
          return [];
        },
      );
      this.months.set(key, month);
    }
    return month;
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
}
