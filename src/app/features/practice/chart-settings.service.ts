import { Injectable, inject, signal } from '@angular/core';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { ChartSettings } from '../../core/models/practice';
import { DEFAULT_INDICATORS, knownIndicators } from './indicators';

/**
 * Each user's chart settings (`users/{uid}/settings/chart`): the indicators they keep on, so
 * every practice and review opens with them. Until they change any, charts show the defaults.
 */
@Injectable({ providedIn: 'root' })
export class ChartSettingsService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly _indicators = signal<readonly string[] | null>(null);
  /** The user's indicators; null until loaded or while they never chose any (defaults). */
  readonly indicators = this._indicators.asReadonly();
  private readonly _news = signal(true);
  /** Whether the chart shows the economic news (on until the user switches it off). */
  readonly news = this._news.asReadonly();
  /** Whose settings were loaded (or are loading), so each user's are read once. */
  private loaded: string | null = null;

  private ref(uid: string) {
    return doc(this.firestore, 'users', uid, 'settings', 'chart');
  }

  /** Reads the signed-in user's settings, once per user. A failed read keeps the defaults. */
  async load(): Promise<void> {
    const uid = this.auth.user()?.uid ?? null;
    if (uid === this.loaded) {
      return;
    }
    this.loaded = uid;
    this._indicators.set(null);
    this._news.set(true);
    if (!uid) {
      return;
    }
    try {
      const saved = (await getDoc(this.ref(uid))).data() as Partial<ChartSettings> | undefined;
      if (this.loaded === uid && knownIndicators(saved?.indicators)) {
        this._indicators.set(saved.indicators);
      }
      if (this.loaded === uid && typeof saved?.news === 'boolean') {
        this._news.set(saved.news);
      }
    } catch {
      // Defaults it is: the chart works without them.
    }
  }

  /** Keeps the indicators the user switched on (or off) for their next sessions. */
  async saveIndicators(indicators: readonly string[]): Promise<void> {
    this._indicators.set(indicators);
    await this.save();
  }

  /** Keeps whether the chart shows the news. */
  async saveNews(news: boolean): Promise<void> {
    this._news.set(news);
    await this.save();
  }

  private async save(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    try {
      await setDoc(this.ref(uid), {
        indicators: [...(this._indicators() ?? DEFAULT_INDICATORS)],
        news: this._news(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Not saved: this session still shows them, the next one opens with the last saved.
    }
  }
}
