import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { THEME_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  let systemDark: boolean;

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />';
    systemDark = false;
    listener = undefined;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: systemDark,
        addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => (listener = fn),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  const html = () => document.documentElement.dataset['theme'];
  const barColor = () =>
    document.querySelector('meta[name="theme-color"]')!.getAttribute('content');

  it('follows the device the first time', () => {
    systemDark = true;
    const theme = TestBed.inject(ThemeService);
    expect(theme.choice()).toBe('system');
    expect(theme.theme()).toBe('dark');
    expect(html()).toBe('dark');
    expect(barColor()).toBe('#121212');
  });

  it('switches when the device does, while following it', () => {
    const theme = TestBed.inject(ThemeService);
    expect(html()).toBe('light');
    listener!({ matches: true } as MediaQueryListEvent);
    expect(theme.theme()).toBe('dark');
    expect(html()).toBe('dark');

    theme.use('light');
    listener!({ matches: true } as MediaQueryListEvent);
    expect(html()).toBe('light');
  });

  it('applies and remembers a choice', () => {
    const theme = TestBed.inject(ThemeService);
    theme.use('dark');
    expect(theme.theme()).toBe('dark');
    expect(html()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    theme.use('system');
    expect(html()).toBe('light');
    expect(barColor()).toBe('#ffffff');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('starts with the saved choice and ignores unknown values', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');

    TestBed.resetTestingModule();
    localStorage.setItem(THEME_KEY, 'neon');
    expect(TestBed.inject(ThemeService).choice()).toBe('system');
  });
});
