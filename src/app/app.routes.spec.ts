import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { Admin } from './features/admin/admin';
import { AdminService } from './features/admin/admin.service';
import { Practice } from './features/practice/practice';
import { PracticeService } from './features/practice/practice.service';
import { EvaluationService } from './features/evaluations/evaluation.service';
import { Profile } from './features/profile/profile';
import { ProfileService } from './features/profile/profile.service';
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
    whenReady: () => Promise.resolve(),
  };

  let harness: RouterTestingHarness | undefined;

  beforeEach(() => {
    harness = undefined;
    auth.isLoggedIn.set(false);
    auth.hasAcademyAccess.set(false);
    auth.isAdmin.set(false);
    auth.isStaff.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: AuthService, useValue: auth },
        { provide: ProfileService, useValue: {} },
        // The practice pages read Firestore on load.
        {
          provide: PracticeService,
          useValue: {
            mySessions: async () => [],
            allSessions: async () => [],
          },
        },
        { provide: EvaluationService, useValue: { all: async () => [], students: async () => [] } },
      ],
    });
    TestBed.overrideComponent(Practice, { set: { template: '' } });
    TestBed.overrideComponent(Profile, { set: { template: '' } });
    // The admin page would open Firestore listeners; only the routing matters here.
    TestBed.overrideComponent(Admin, {
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
    expect(await visit('/login')).toBe('/login');
    expect(await visit('/register')).toBe('/register');
    expect(await visit('/no-existe')).toBe('/no-existe');
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
  });

  it('keeps students without access in the academy', async () => {
    signIn();
    expect(await visit('/academy')).toBe('/academy');
    expect(await visit('/profile')).toBe('/profile');
    expect(await visit('/academy/material')).toBe('/academy');
    expect(await visit('/academy/practice')).toBe('/academy');
    expect(await visit('/academy/ranking')).toBe('/academy');
    expect(await visit('/academy/calendar')).toBe('/academy');
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
    expect(await visit('/admin/practice')).toBe('/academy');
    expect(await visit('/admin/evaluations')).toBe('/academy');
  });

  it('opens the admin area and evaluations to trainers', async () => {
    signIn({ trainer: true });
    expect(await visit('/admin')).toBe('/admin');
    expect(await visit('/admin/practice')).toBe('/admin/practice');
    expect(await visit('/admin/evaluations')).toBe('/admin/evaluations');
    expect(await visit('/academy/practice')).toBe('/academy/practice');
  });

  it('opens the admin area to admins', async () => {
    signIn({ admin: true });
    expect(await visit('/admin')).toBe('/admin');
    expect(await visit('/admin/practice')).toBe('/admin/practice');
  });
});
