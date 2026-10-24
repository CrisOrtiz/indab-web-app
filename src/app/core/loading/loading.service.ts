import { Injectable, computed, signal } from '@angular/core';

/**
 * Counts what the app is waiting for (route changes, page data) so the loader (`AppLoader`)
 * can show the bouncing logo while anything is pending. Wrap reads with `track()`; background
 * work that should not cover the page (e.g. the replay's next candles) stays untracked.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly pending = signal(0);

  readonly busy = computed(() => this.pending() > 0);

  /** Marks one task as started; call the returned function once it is done (extra calls are ignored). */
  begin(): () => void {
    this.pending.update((n) => n + 1);
    let done = false;
    return () => {
      if (!done) {
        done = true;
        this.pending.update((n) => n - 1);
      }
    };
  }

  /** Shows the loader until `work` settles, and passes its result or error through. */
  async track<T>(work: Promise<T>): Promise<T> {
    const end = this.begin();
    try {
      return await work;
    } finally {
      end();
    }
  }
}
