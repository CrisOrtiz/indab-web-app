import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  InjectionToken,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';

/** Chrome's install prompt (`beforeinstallprompt`), not in the DOM typings yet. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Whether the site offers "Install app" (account menu, footer). Off for now (Cris, 2026-10-27:
 * not until INDAB really needs an app); the PWA itself (manifest, service worker) stays.
 */
export const INSTALL_OFFER_ENABLED = new InjectionToken<boolean>('INSTALL_OFFER_ENABLED', {
  providedIn: 'root',
  factory: () => false,
});

/** Where the early listener in index.html keeps a prompt fired before the app started. */
type InstallWindow = Window & { indabInstallPrompt?: InstallPromptEvent | null };

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIosDevice(navigator: Navigator): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * "Install app" (PWA). Chrome, Edge and Android hand us an install prompt; iOS has none, so
 * there the option opens instructions for Share > Add to Home Screen. Nothing is offered once
 * the site runs as the installed app, or on browsers that can do neither (Firefox desktop).
 */
@Injectable({ providedIn: 'root' })
export class AppInstall {
  private readonly window = inject(DOCUMENT).defaultView as InstallWindow | null;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly prompt = signal<InstallPromptEvent | null>(null);
  private readonly installed = signal(false);
  private readonly enabled = inject(INSTALL_OFFER_ENABLED);

  /** True on iPhone and iPad, where installing is done by hand from the Share menu. */
  readonly ios = signal(false);
  /** The iOS instructions dialog. */
  readonly helpOpen = signal(false);
  /** Whether to show the "Install app" option. */
  readonly available = computed(
    () => this.enabled && !this.installed() && (!!this.prompt() || this.ios()),
  );

  constructor() {
    const win = this.window;
    if (!this.browser || !win) {
      return;
    }
    const standalone =
      win.matchMedia?.('(display-mode: standalone)').matches ||
      (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
    this.installed.set(!!standalone);
    this.ios.set(isIosDevice(win.navigator));
    this.prompt.set(win.indabInstallPrompt ?? null);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      this.prompt.set(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      this.installed.set(true);
      this.prompt.set(null);
      win.indabInstallPrompt = null;
    };
    win.addEventListener('beforeinstallprompt', onPrompt);
    win.addEventListener('appinstalled', onInstalled);
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('beforeinstallprompt', onPrompt);
      win.removeEventListener('appinstalled', onInstalled);
    });
  }

  /** Opens the browser's install dialog, or the iOS instructions. */
  async install(): Promise<void> {
    const prompt = this.prompt();
    if (!prompt) {
      this.helpOpen.set(this.ios());
      return;
    }
    // A prompt can be shown only once; Chrome fires a new event if the user dismisses it.
    this.prompt.set(null);
    if (this.window) {
      this.window.indabInstallPrompt = null;
    }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      this.installed.set(true);
    }
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }
}
