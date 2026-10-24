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
import {
  adminGuard,
  authGuard,
  enrolledGuard,
  guestGuard,
  setupGuard,
  staffGuard,
} from './auth.guards';

describe('auth guards', () => {
  const isLoggedIn = signal(false);
  const hasAcademyAccess = signal(false);
  const isAdmin = signal(false);
  const isStaff = signal(false);
  const setupStep = signal<'verifyEmail' | 'details' | null>(null);
  const state = { url: '/repository' } as RouterStateSnapshot;
  const route = {} as ActivatedRouteSnapshot;

  beforeEach(() => {
    isLoggedIn.set(false);
    hasAcademyAccess.set(false);
    isAdmin.set(false);
    isStaff.set(false);
    setupStep.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isLoggedIn,
            hasAcademyAccess,
            isAdmin,
            isStaff,
            setupStep,
            whenReady: () => Promise.resolve(),
          },
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
    isStaff.set(true);
    expect(url(await run(adminGuard))).toBe('/academy');
    isAdmin.set(true);
    expect(await run(adminGuard)).toBe(true);
  });

  it('staffGuard lets in trainers and admins', async () => {
    expect(url(await run(staffGuard))).toBe('/login?returnUrl=%2Frepository');
    isLoggedIn.set(true);
    hasAcademyAccess.set(true);
    expect(url(await run(staffGuard))).toBe('/academy');
    isStaff.set(true);
    expect(await run(staffGuard)).toBe(true);
  });

  it('sends users with a setup step left to the account setup page', async () => {
    isLoggedIn.set(true);
    hasAcademyAccess.set(true);
    isStaff.set(true);
    isAdmin.set(true);
    setupStep.set('verifyEmail');
    for (const guard of [authGuard, enrolledGuard, staffGuard, adminGuard]) {
      expect(url(await run(guard))).toBe('/account-setup?returnUrl=%2Frepository');
    }
    setupStep.set('details');
    expect(url(await run(authGuard))).toBe('/account-setup?returnUrl=%2Frepository');
  });

  it('setupGuard opens the setup page only while a step is left', async () => {
    expect(url(await run(setupGuard))).toBe('/login?returnUrl=%2Frepository');
    isLoggedIn.set(true);
    expect(url(await run(setupGuard))).toBe('/academy');
    setupStep.set('details');
    expect(await run(setupGuard)).toBe(true);
  });
});
