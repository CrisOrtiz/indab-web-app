import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { FIRESTORE_LOADER } from './core/firebase/firebase.providers';
import { AdminUsers } from './features/admin/users/users';
import { AdminService } from './features/admin/admin.service';
import { MentorshipService } from './features/mentorships/mentorship.service';
import { Practice } from './features/practice/practice';
import { PracticeService } from './features/practice/practice.service';
import { EvaluationService } from './features/evaluations/evaluation.service';
import { Profile } from './features/profile/profile';
import { ProfileService } from './features/profile/profile.service';
import { SessionsService } from './features/profile/sessions.service';
import { AccountSetup } from './features/account-setup/account-setup';
import { en } from './core/i18n/messages/en';
import { es } from './core/i18n/messages/es';
import { pt } from './core/i18n/messages/pt';

describe('app routes', () => {
  const auth = {
    user: signal<{ uid: string; email: string } | null>(null),
    profile: signal(null),
    isLoggedIn: signal(false),
    hasAcademyAccess: signal(false),
    isAdmin: signal(false),
    isStaff: signal(false),
    setupStep: signal<'verifyEmail' | 'details' | null>(null),
    whenReady: () => Promise.resolve(),
  };

  const firestore = { load: vi.fn(async () => ({})), instance: () => null };
  let harness: RouterTestingHarness | undefined;

  beforeEach(() => {
    harness = undefined;
    firestore.load.mockClear();
    auth.isLoggedIn.set(false);
    auth.hasAcademyAccess.set(false);
    auth.isAdmin.set(false);
    auth.isStaff.set(false);
    auth.setupStep.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: AuthService, useValue: auth },
        { provide: FIRESTORE_LOADER, useValue: firestore },
        { provide: ProfileService, useValue: {} },
        { provide: SessionsService, useValue: { watch: () => () => undefined } },
        // The practice pages read Firestore on load.
        {
          provide: PracticeService,
          useValue: {
            mySessions: async () => [],
            sessionsPage: async () => ({ items: [], last: undefined, hasMore: false }),
            sessionTotals: async () => ({ sessions: 0, trades: 0 }),
          },
        },
        {
          provide: EvaluationService,
          useValue: {
            all: async () => [],
            students: async () => [],
            directory: async () => ({ students: [], staff: [] }),
          },
        },
        { provide: MentorshipService, useValue: { all: async () => [] } },
      ],
    });
    TestBed.overrideComponent(Practice, { set: { template: '' } });
    TestBed.overrideComponent(Profile, { set: { template: '' } });
    TestBed.overrideComponent(AccountSetup, { set: { template: '' } });
    // The users page would open Firestore listeners; only the routing matters here.
    TestBed.overrideComponent(AdminUsers, {
      set: { providers: [{ provide: AdminService, useValue: {} }], template: '' },
    });
  });

  /** Navigates and returns where the router ended up. */
  const visit = async (url: string) => {
    harness ??= await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  };
  const signIn = (state: { academy?: boolean; admin?: boolean; trainer?: boolean } = {}) => {
    auth.isLoggedIn.set(true);
    auth.user.set({ uid: 'u1', email: 'u1@indab.co' });
    auth.hasAcademyAccess.set(!!state.academy || !!state.admin || !!state.trainer);
    auth.isAdmin.set(!!state.admin);
    auth.isStaff.set(!!state.admin || !!state.trainer);
  };

  const pages = routes.filter((route) => !route.redirectTo);

  it('gives every route a translated title for the browser tab', () => {
    for (const route of pages) {
      const key = route.title as keyof typeof es.titles;
      expect(es.titles[key], route.path).toMatch(/INDAB|Eleva/);
      expect(en.titles[key], route.path).toMatch(/INDAB|Eleva/);
      expect(pt.titles[key], route.path).toMatch(/INDAB|Eleva/);
    }
    expect(routes.at(-1)?.path).toBe('**');
  });

  it('lazy-loads a component for every route', async () => {
    for (const route of pages) {
      expect(await route.loadComponent!(), route.path).toBeTruthy();
    }
  });

  it('lets visitors see the public pages', async () => {
    expect(await visit('/')).toBe('/');
    expect(await visit('/eleva')).toBe('/eleva');
    expect(await visit('/calendar')).toBe('/calendar');
    expect(await visit('/login')).toBe('/login');
    expect(await visit('/register')).toBe('/register');
    expect(await visit('/no-existe')).toBe('/no-existe');
  });

  it('downloads Firestore only once a visitor heads to sign in or register', async () => {
    await visit('/');
    await visit('/eleva');
    await visit('/calendar');
    expect(firestore.load).not.toHaveBeenCalled();
    await visit('/login');
    expect(firestore.load).toHaveBeenCalled();
    firestore.load.mockClear();
    await visit('/register');
    expect(firestore.load).toHaveBeenCalled();
  });

  it('sends visitors to login from private pages', async () => {
    expect(await visit('/academy')).toBe('/login?returnUrl=%2Facademy');
    expect(await visit('/profile')).toBe('/login?returnUrl=%2Fprofile');
    expect(await visit('/academy/material')).toBe('/login?returnUrl=%2Facademy%2Fmaterial');
    expect(await visit('/admin')).toBe('/login?returnUrl=%2Fadmin');
    expect(await visit('/academy/practice')).toBe('/login?returnUrl=%2Facademy%2Fpractice');
    expect(await visit('/admin/practice')).toBe('/login?returnUrl=%2Fadmin%2Fpractice');
    expect(await visit('/academy/ranking')).toBe('/login?returnUrl=%2Facademy%2Franking');
    expect(await visit('/academy/calendar')).toBe('/login?returnUrl=%2Facademy%2Fcalendar');
    expect(await visit('/admin/evaluations')).toBe('/login?returnUrl=%2Fadmin%2Fevaluations');
    expect(await visit('/account-setup')).toBe('/login?returnUrl=%2Faccount-setup');
  });

  it('sends users who have not finished setting up their account to the setup page', async () => {
    signIn({ admin: true });
    auth.setupStep.set('verifyEmail');
    expect(await visit('/academy')).toBe('/account-setup?returnUrl=%2Facademy');
    expect(await visit('/profile')).toBe('/account-setup?returnUrl=%2Fprofile');
    expect(await visit('/academy/practice')).toBe('/account-setup?returnUrl=%2Facademy%2Fpractice');
    expect(await visit('/admin')).toBe('/account-setup?returnUrl=%2Fadmin');
    auth.setupStep.set('details');
    expect(await visit('/academy/material')).toBe('/account-setup?returnUrl=%2Facademy%2Fmaterial');
    expect(await visit('/account-setup')).toBe('/account-setup');

    auth.setupStep.set(null);
    expect(await visit('/profile')).toBe('/profile');
    expect(await visit('/account-setup')).toBe('/academy');
  });

  it('keeps students without access in the academy', async () => {
    signIn();
    expect(await visit('/academy')).toBe('/academy');
    expect(await visit('/profile')).toBe('/profile');
    expect(await visit('/academy/material')).toBe('/academy');
    expect(await visit('/academy/practice')).toBe('/academy');
    expect(await visit('/academy/ranking')).toBe('/academy');
    // The calendar is public, so the academy opens it for everyone signed in.
    expect(await visit('/academy/calendar')).toBe('/academy/calendar');
    expect(await visit('/admin')).toBe('/academy');
    expect(await visit('/login')).toBe('/academy');
    expect(await visit('/register')).toBe('/academy');
  });

  it('opens the material to enrolled students', async () => {
    signIn({ academy: true });
    expect(await visit('/academy/material')).toBe('/academy/material');
    expect(await visit('/repository')).toBe('/academy/material');
    expect(await visit('/academy/practice')).toBe('/academy/practice');
    expect(await visit('/academy/calendar')).toBe('/academy/calendar');
    expect(await visit('/academy/ranking')).toBe('/academy/ranking');
    expect(await visit('/admin')).toBe('/academy');
    expect(await visit('/admin/users')).toBe('/academy');
    expect(await visit('/admin/practice')).toBe('/academy');
    expect(await visit('/admin/evaluations')).toBe('/academy');
    expect(await visit('/admin/mentorships')).toBe('/academy');
  });

  it('opens the admin area and evaluations to trainers', async () => {
    signIn({ trainer: true });
    expect(await visit('/admin')).toBe('/admin');
    expect(await visit('/admin/practice')).toBe('/admin/practice');
    expect(await visit('/admin/evaluations')).toBe('/admin/evaluations');
    expect(await visit('/admin/mentorships')).toBe('/admin/mentorships');
    expect(await visit('/admin/users')).toBe('/academy');
    expect(await visit('/academy/practice')).toBe('/academy/practice');
  });

  it('opens the admin area to admins', async () => {
    signIn({ admin: true });
    expect(await visit('/admin')).toBe('/admin');
    expect(await visit('/admin/users')).toBe('/admin/users');
    expect(await visit('/admin/practice')).toBe('/admin/practice');
  });
});
