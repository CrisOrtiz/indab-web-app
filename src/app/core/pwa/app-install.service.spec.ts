import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  AppInstall,
  INSTALL_OFFER_ENABLED,
  InstallPromptEvent,
  isIosDevice,
} from './app-install.service';

type TestWindow = Window & { indabInstallPrompt?: InstallPromptEvent | null };

/** A Chrome install prompt whose dialog answers `outcome`. */
const promptEvent = (outcome: 'accepted' | 'dismissed' = 'accepted') => {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as InstallPromptEvent;
  Object.assign(event, {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  });
  return event;
};

describe('AppInstall', () => {
  const win = window as TestWindow;
  let standalone = false;

  beforeEach(() => {
    standalone = false;
    TestBed.configureTestingModule({
      providers: [{ provide: INSTALL_OFFER_ENABLED, useValue: true }],
    });
    win.indabInstallPrompt = null;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(display-mode: standalone)' && standalone,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete win.indabInstallPrompt;
  });

  it('offers nothing while the option is switched off (the default for now)', () => {
    TestBed.resetTestingModule();
    win.indabInstallPrompt = promptEvent();
    expect(TestBed.inject(AppInstall).available()).toBe(false);
  });

  it('offers nothing on browsers without an install prompt', () => {
    const install = TestBed.inject(AppInstall);
    expect(install.available()).toBe(false);
  });

  it('uses a prompt caught by index.html before the app started', async () => {
    const event = promptEvent();
    win.indabInstallPrompt = event;
    const install = TestBed.inject(AppInstall);
    expect(install.available()).toBe(true);

    await install.install();
    expect(event.prompt).toHaveBeenCalled();
    expect(install.available()).toBe(false);
    expect(win.indabInstallPrompt).toBeNull();
  });

  it('keeps a prompt fired later, and offers again after a dismissed one', async () => {
    const install = TestBed.inject(AppInstall);
    const first = promptEvent('dismissed');
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(install.available()).toBe(true);

    await install.install();
    expect(install.available()).toBe(false);
    window.dispatchEvent(promptEvent());
    expect(install.available()).toBe(true);
  });

  it('hides the option once the app is installed', () => {
    const install = TestBed.inject(AppInstall);
    window.dispatchEvent(promptEvent());
    window.dispatchEvent(new Event('appinstalled'));
    expect(install.available()).toBe(false);
  });

  it('offers nothing inside the installed app', () => {
    standalone = true;
    win.indabInstallPrompt = promptEvent();
    expect(TestBed.inject(AppInstall).available()).toBe(false);
  });

  it('shows the instructions on iPhone, which has no prompt', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
    );
    const install = TestBed.inject(AppInstall);
    expect(install.ios()).toBe(true);
    expect(install.available()).toBe(true);

    await install.install();
    expect(install.helpOpen()).toBe(true);
    install.closeHelp();
    expect(install.helpOpen()).toBe(false);
  });

  it('recognizes iPhone and iPad (which reports a Mac with touch)', () => {
    const nav = (userAgent: string, platform = '', maxTouchPoints = 0) =>
      ({ userAgent, platform, maxTouchPoints }) as Navigator;
    expect(isIosDevice(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)'))).toBe(true);
    expect(isIosDevice(nav('Mozilla/5.0 (Macintosh)', 'MacIntel', 5))).toBe(true);
    expect(isIosDevice(nav('Mozilla/5.0 (Macintosh)', 'MacIntel', 0))).toBe(false);
    expect(isIosDevice(nav('Mozilla/5.0 (Linux; Android 15)', 'Linux armv8l', 5))).toBe(false);
  });
});
