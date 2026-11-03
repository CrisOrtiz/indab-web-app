import { Injectable, OnDestroy } from '@angular/core';

const CHANNEL = 'indab-practice-session';

interface TabMessage {
  sessionId: string;
  tab: string;
}

/**
 * Keeps a practice session on one tab of this browser: when another tab opens the same
 * session, this one hears of it and lets go (`onTaken`), so two screens never trade, or
 * look ahead, on the same replay.
 */
@Injectable()
export class SessionTabs implements OnDestroy {
  private readonly tab = Math.random().toString(36).slice(2);
  private readonly channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  private current: string | null = null;
  private taken: (sessionId: string) => void = () => undefined;

  constructor() {
    this.channel?.addEventListener('message', (event: MessageEvent<TabMessage>) => {
      const { sessionId, tab } = event.data ?? {};
      if (sessionId && tab !== this.tab && sessionId === this.current) {
        this.current = null;
        this.taken(sessionId);
      }
    });
  }

  /** What to do when another tab opens the session on screen. */
  onTaken(handler: (sessionId: string) => void): void {
    this.taken = handler;
  }

  /** This tab shows `sessionId` now: any other tab showing it lets go. */
  open(sessionId: string): void {
    this.current = sessionId;
    this.channel?.postMessage({ sessionId, tab: this.tab } satisfies TabMessage);
  }

  /** This tab no longer shows a session. */
  close(): void {
    this.current = null;
  }

  ngOnDestroy(): void {
    this.channel?.close();
  }
}
