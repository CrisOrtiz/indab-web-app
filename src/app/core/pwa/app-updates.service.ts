import { DOCUMENT } from '@angular/common';
import { ApplicationRef, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter, first } from 'rxjs';

/** How often an open app asks the server for a new version. */
export const UPDATE_CHECK_MS = 30 * 60 * 1000;

/**
 * New versions of the site (service worker, production builds only). The worker downloads a
 * deploy in the background; once it is ready the user gets a banner to reload into it, so an
 * installed app that stays open for days still picks up new releases. Pages that could not
 * recover their files (an old version removed from the cache) reload at once.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly document = inject(DOCUMENT);
  private readonly _ready = signal(false);

  /** A new version is downloaded and waiting for a reload. */
  readonly ready = this._ready.asReadonly();

  constructor() {
    const updates = this.updates;
    const win = this.document.defaultView;
    if (!updates?.isEnabled || !win) {
      return;
    }
    updates.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(() => this._ready.set(true));
    updates.unrecoverable.subscribe(() => this.reload());

    // Installed apps are resumed rather than reloaded: check when the app comes back, and
    // every half hour while it is open (not before the app is stable, so the first load is fast).
    const check = () => updates.checkForUpdate().catch(() => undefined);
    const onVisible = () => {
      if (this.document.visibilityState === 'visible') {
        void check();
      }
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    inject(ApplicationRef)
      .isStable.pipe(first((stable) => stable))
      .subscribe(() => {
        timer = setInterval(check, UPDATE_CHECK_MS);
        this.document.addEventListener('visibilitychange', onVisible);
      });
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** Loads the new version. */
  reload(): void {
    this.document.location.reload();
  }

  dismiss(): void {
    this._ready.set(false);
  }
}
