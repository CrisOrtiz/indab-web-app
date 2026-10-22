import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from './auth.service';
import { adminGuard, authGuard, enrolledGuard, guestGuard } from './auth.guards';

describe('auth guards', () => {
  const isLoggedIn = signal(false);
  const hasAcademyAccess = signal(false);
  const isAdmin = signal(false);
  const state = { url: '/repository' } as RouterStateSnapshot;
  const route = {} as ActivatedRouteSnapshot;

  beforeEach(() => {
    isLoggedIn.set(false);
    hasAcademyAccess.set(false);
    isAdmin.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { isLoggedIn, hasAcademyAccess, isAdmin, whenReady: () => Promise.resolve() },
        },
      ],
    });
  });

  const run = (guard: typeof authGuard) => TestBed.runInInjectionContext(() => guard(route, state));
  const url = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('authGuard sends visitors to login with a return url', async () => {
    expect(url(await run(authGuard))).toBe('/login?returnUrl=%2Frepository');
    isLoggedIn.set(true);
    expect(await run(authGuard)).toBe(true);
  });

  it('guestGuard sends signed-in users to the academy', async () => {
    expect(await run(guestGuard)).toBe(true);
    isLoggedIn.set(true);
    expect(url(await run(guestGuard))).toBe('/academy');
  });

  it('enrolledGuard requires academy access', async () => {
    expect(url(await run(enrolledGuard))).toBe('/login?returnUrl=%2Frepository');
    isLoggedIn.set(true);
    expect(url(await run(enrolledGuard))).toBe('/academy');
    hasAcademyAccess.set(true);
    expect(await run(enrolledGuard)).toBe(true);
  });

  it('adminGuard requires the admin role', async () => {
    expect(url(await run(adminGuard))).toBe('/login?returnUrl=%2Frepository');
    isLoggedIn.set(true);
    hasAcademyAccess.set(true);
    expect(url(await run(adminGuard))).toBe('/academy');
    isAdmin.set(true);
    expect(await run(adminGuard)).toBe(true);
  });
});
