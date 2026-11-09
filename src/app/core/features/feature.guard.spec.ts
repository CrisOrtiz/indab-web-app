import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { featureFlagsReady, featureGuard } from './feature.guard';
import { quietFeatureFlags } from './testing';

describe('feature guards', () => {
  const isLoggedIn = signal(true);
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/academy/ranking' } as RouterStateSnapshot;
  let quiet: ReturnType<typeof quietFeatureFlags>;

  beforeEach(() => {
    isLoggedIn.set(true);
    quiet = quietFeatureFlags();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isLoggedIn, whenReady: async () => undefined } },
        ...quiet.providers,
      ],
    });
  });

  const run = (guard: ReturnType<typeof featureGuard>) =>
    TestBed.runInInjectionContext(() => guard(route, state));
  const url = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('opens a shown feature and sends hidden ones to the academy home', async () => {
    expect(await run(featureGuard('ranking'))).toBe(true);
    quiet.flags.set({ ranking: 'off' });
    expect(url(await run(featureGuard('ranking')))).toBe('/academy');
    quiet.flags.set({ ranking: 'staff' });
    expect(url(await run(featureGuard('ranking')))).toBe('/academy');
  });

  it('leaves visitors to the access guards', async () => {
    isLoggedIn.set(false);
    quiet.flags.set({ ranking: 'off' });
    expect(await run(featureGuard('ranking'))).toBe(true);
  });

  it('loads the flags before pages that hide parts by them', async () => {
    const whenReady = vi.spyOn(quiet.service, 'whenReady');
    expect(await run(featureFlagsReady)).toBe(true);
    expect(whenReady).toHaveBeenCalled();
    whenReady.mockClear();
    isLoggedIn.set(false);
    expect(await run(featureFlagsReady)).toBe(true);
    expect(whenReady).not.toHaveBeenCalled();
  });
});
