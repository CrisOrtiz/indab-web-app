import { Injectable, inject, signal } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FIRESTORE_LOADER } from '../firebase/firebase.providers';
import { FeatureKey, FeatureMode, featureShown } from '../models/feature-flags';

/** How long a page waits for the flags before showing everything (offline, slow network). */
const WAIT_MS = 4000;

/**
 * The features admins show or hide at `/admin/features` (`config/features`). Signed-in users
 * listen to that one document: one read when they arrive, one per change. The route guards
 * (`featureGuard`, `featureFlagsReady`) start it, so pages can read `shown()` right away.
 * Hiding is for the screens only: the Firestore rules of each feature stay as they are.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlags {
  private readonly auth = inject(AuthService);
  private readonly loader = inject(FIRESTORE_LOADER);

  private readonly _flags = signal<Partial<Record<FeatureKey, FeatureMode>>>({});
  /** The stored modes; a missing key is `on`. */
  readonly flags = this._flags.asReadonly();

  private watchedUid: string | null = null;
  private ready: Promise<void> = Promise.resolve();
  private stop: (() => void) | null = null;

  /** Starts listening for the signed-in account (once) and resolves after the first load. */
  whenReady(): Promise<void> {
    const uid = this.auth.user()?.uid ?? null;
    if (uid !== this.watchedUid) {
      this.ready = this.watch(uid);
    }
    return this.ready;
  }

  /** Whether the current user sees `key` (reactive: reads signals). */
  shown(key: FeatureKey): boolean {
    return featureShown(this._flags()[key], this.auth.isStaff());
  }

  /** Admins only (the rules check it): sets who sees a feature. */
  async setMode(key: FeatureKey, mode: FeatureMode): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Not signed in');
    }
    const [data, firestore] = await Promise.all([
      import('./feature-flags-data'),
      this.loader.load(),
    ]);
    await data.saveFlag(firestore, key, mode, uid);
    // The listener reports it too; this makes the page agree at once.
    this._flags.update((flags) => ({ ...flags, [key]: mode }));
  }

  private async watch(uid: string | null): Promise<void> {
    this.stop?.();
    this.stop = null;
    this.watchedUid = uid;
    if (!uid) {
      this._flags.set({});
      return;
    }
    let data: typeof import('./feature-flags-data');
    let firestore: Firestore;
    try {
      [data, firestore] = await Promise.all([import('./feature-flags-data'), this.loader.load()]);
    } catch {
      // Offline or a stale deploy: everything stays visible.
      this.watchedUid = null;
      return;
    }
    if (this.watchedUid !== uid) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, WAIT_MS);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      this.stop = data.watchFlags(
        firestore,
        (flags) => {
          this._flags.set(flags);
          done();
        },
        () => {
          // Denied (e.g. signed out meanwhile) or failed: try again on the next page.
          if (this.watchedUid === uid) {
            this.watchedUid = null;
            this.stop = null;
          }
          done();
        },
      );
    });
  }
}
