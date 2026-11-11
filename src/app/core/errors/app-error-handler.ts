import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Browsers fire a window `error` with these messages when a ResizeObserver callback changes
 * layout (the chart library's own `autoSize` does it while the window resizes). Nothing is lost:
 * the pending notifications arrive in the next frame. `provideBrowserGlobalErrorListeners()`
 * forwards the event here, so without this filter it shows as "ERROR" in the console.
 */
const BENIGN_MESSAGES = [
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded',
];

export function isBenignError(error: unknown): boolean {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown } | null)?.message === 'string'
          ? (error as { message: string }).message
          : '';
  return BENIGN_MESSAGES.some((benign) => message.includes(benign));
}

/** Angular's default handler, minus the benign browser warnings above. */
@Injectable()
export class AppErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    if (isBenignError(error)) {
      return;
    }
    super.handleError(error);
  }
}
