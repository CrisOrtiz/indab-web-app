import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, vi } from 'vitest';
import { I18n } from '../../core/i18n/i18n.service';
import { LoadingService } from '../../core/loading/loading.service';
import { AppLoader, HIDE_GRACE_MS, MIN_VISIBLE_MS, SHOW_DELAY_MS } from './loader';

@Component({ template: '' })
class Page {}

describe('AppLoader', () => {
  let slowGuard: Promise<boolean>;
  let releaseGuard: (allow: boolean) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    slowGuard = new Promise((resolve) => (releaseGuard = resolve));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'slow', component: Page, canActivate: [() => slowGuard] },
          { path: '**', component: Page },
        ]),
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.getElementById('boot-loader')?.remove();
  });

  const render = () => {
    const fixture = TestBed.createComponent(AppLoader);
    fixture.detectChanges();
    const loader = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.app-loader');
    const advance = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      fixture.detectChanges();
    };
    return { fixture, loader, advance };
  };

  it('replaces the static loader and fades out once the first page is ready', async () => {
    const boot = document.createElement('div');
    boot.id = 'boot-loader';
    document.body.append(boot);

    const { loader, advance } = render();
    expect(document.getElementById('boot-loader')).toBeNull();
    expect(loader()?.classList).toContain('app-loader--boot');
    expect(loader()?.getAttribute('aria-label')).toBe('Cargando…');

    await advance(HIDE_GRACE_MS);
    expect(loader()).toBeNull();
  });

  it('shows the logo after a short delay while something loads, then hides it', async () => {
    const { loader, advance } = render();
    await advance(HIDE_GRACE_MS);
    const end = TestBed.inject(LoadingService).begin();
    TestBed.tick();

    await advance(SHOW_DELAY_MS - 1);
    expect(loader()).toBeNull();
    await advance(1);
    expect(loader()).not.toBeNull();
    expect(loader()?.classList).not.toContain('app-loader--boot');

    end();
    TestBed.tick();
    await advance(MIN_VISIBLE_MS - 1);
    expect(loader()).not.toBeNull();
    await advance(1);
    expect(loader()).toBeNull();
  });

  it('never shows for loads quicker than the delay', async () => {
    const { loader, advance } = render();
    await advance(HIDE_GRACE_MS);
    const end = TestBed.inject(LoadingService).begin();
    TestBed.tick();
    await advance(SHOW_DELAY_MS / 2);
    end();
    TestBed.tick();
    await advance(SHOW_DELAY_MS * 2);
    expect(loader()).toBeNull();
  });

  it('shows while the router waits for a guard', async () => {
    const { loader, advance } = render();
    await advance(HIDE_GRACE_MS);
    const navigation = TestBed.inject(Router).navigateByUrl('/slow');
    await advance(SHOW_DELAY_MS);
    expect(loader()).not.toBeNull();

    releaseGuard(true);
    await navigation;
    await advance(MIN_VISIBLE_MS);
    expect(loader()).toBeNull();
  });

  it('reads its label in the current language', async () => {
    await TestBed.inject(I18n).use('pt-BR');
    const { loader } = render();
    expect(loader()?.getAttribute('role')).toBe('progressbar');
    expect(loader()?.getAttribute('aria-label')).toBe('Carregando…');
  });
});
