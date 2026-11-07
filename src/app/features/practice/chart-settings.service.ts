import { Injectable, inject, signal } from '@angular/core';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { ChartSettings } from '../../core/models/practice';
import { DEFAULT_INDICATORS, IndicatorConfig, knownIndicators, readConfigs } from './indicators';

/**
 * Each user's chart settings (`users/{uid}/settings/chart`): the indicators they keep on and
 * how they set them up, so every practice and review opens with them. Until they change any,
 * charts show the defaults.
 */
@Injectable({ providedIn: 'root' })
export class ChartSettingsService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly _indicators = signal<readonly string[] | null>(null);
  /** The user's indicators; null until loaded or while they never chose any (defaults). */
  readonly indicators = this._indicators.asReadonly();
  private readonly _configs = signal<Readonly<Record<string, IndicatorConfig>>>({});
  /** How the user set up indicators, by id; the ones missing are as they come. */
  readonly configs = this._configs.asReadonly();
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
    this._configs.set({});
    if (!uid) {
      return;
    }
    try {
      const saved = (await getDoc(this.ref(uid))).data() as Partial<ChartSettings> | undefined;
      if (this.loaded === uid && knownIndicators(saved?.indicators)) {
        this._indicators.set(saved.indicators);
        this._configs.set(readConfigs(saved.configs));
      }
    } catch {
      // Defaults it is: the chart works without them.
    }
  }

  /** Keeps the indicators the user switched on (or off) for their next sessions. */
  saveIndicators(indicators: readonly string[]): Promise<void> {
    this._indicators.set(indicators);
    return this.save();
  }

  /** Keeps how the user set up indicators, with the indicators on as they are. */
  saveConfigs(configs: Readonly<Record<string, IndicatorConfig>>): Promise<void> {
    this._configs.set(configs);
    return this.save();
  }

  private async save(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    try {
      await setDoc(this.ref(uid), {
        indicators: [...(this._indicators() ?? DEFAULT_INDICATORS)],
        configs: { ...this._configs() },
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Not saved: this session still shows them, the next one opens with the last saved.
    }
  }
}
