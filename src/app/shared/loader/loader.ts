import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';
import { LoadingService } from '../../core/loading/loading.service';

/** Waits this long before covering the page, so quick loads do not flash the loader. */
export const SHOW_DELAY_MS = 200;
/** Once shown, the loader stays at least this long, so the bounce never cuts off abruptly. */
export const MIN_VISIBLE_MS = 500;
/** Gap allowed between two tasks (e.g. a route and then its data) without hiding the loader. */
export const HIDE_GRACE_MS = 120;

/**
 * Full-page loader with the INDAB logo bouncing. It takes over from the static one in
 * `index.html` (shown until the app boots, opaque) and then appears, translucent, whenever the
 * router navigates or `LoadingService` tracks a read. Styles live in `src/styles.scss` so the
 * static loader can use them before the app starts.
 */
@Component({
  selector: 'app-loader',
  template: `
    @if (shown()) {
      <div
        class="app-loader"
        [class.app-loader--boot]="booting()"
        role="progressbar"
        [attr.aria-label]="i18n.messages().loader.label"
      >
        <img class="app-loader__logo" src="logo.jpg" alt="" width="96" height="96" />
        <span class="app-loader__shadow"></span>
      </div>
    }
  `,
})
export class AppLoader {
  protected readonly i18n = inject(I18n);
  private readonly loading = inject(LoadingService);

  /** Starts shown: the page is still loading when the app boots. */
  protected readonly shown = signal(true);
  /** Opaque until the first page is ready, so a half-rendered page never shows. */
  protected readonly booting = signal(true);

  /** The static loader has been up since the first paint, so no minimum applies to it. */
  private shownAt = 0;
  private showTimer?: ReturnType<typeof setTimeout>;
  private hideTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DOCUMENT).getElementById('boot-loader')?.remove();

    const router = inject(Router);
    let endNavigation: (() => void) | null = null;
    router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        endNavigation?.();
        endNavigation = this.loading.begin();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        endNavigation?.();
        endNavigation = null;
      }
    });

    effect(() => {
      const busy = this.loading.busy();
      untracked(() => (busy ? this.scheduleShow() : this.scheduleHide()));
    });

    inject(DestroyRef).onDestroy(() => {
      endNavigation?.();
      clearTimeout(this.showTimer);
      clearTimeout(this.hideTimer);
    });
  }

  private scheduleShow(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    if (this.shown() || this.showTimer) {
      return;
    }
    this.showTimer = setTimeout(() => {
      this.showTimer = undefined;
      this.shownAt = Date.now();
      this.shown.set(true);
    }, SHOW_DELAY_MS);
  }

  private scheduleHide(): void {
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
    if (!this.shown() || this.hideTimer) {
      return;
    }
    const wait = Math.max(HIDE_GRACE_MS, MIN_VISIBLE_MS - (Date.now() - this.shownAt));
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      this.shown.set(false);
      this.booting.set(false);
    }, wait);
  }
}
