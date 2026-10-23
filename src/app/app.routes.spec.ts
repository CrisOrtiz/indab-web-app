import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { Admin } from './features/admin/admin';
import { AdminService } from './features/admin/admin.service';

describe('app routes', () => {
  const auth = {
    user: signal<{ uid: string; email: string } | null>(null),
    profile: signal(null),
    isLoggedIn: signal(false),
    hasAcademyAccess: signal(false),
    isAdmin: signal(false),
    whenReady: () => Promise.resolve(),
  };

  let harness: RouterTestingHarness | undefined;

  beforeEach(() => {
    harness = undefined;
    auth.isLoggedIn.set(false);
    auth.hasAcademyAccess.set(false);
    auth.isAdmin.set(false);
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: AuthService, useValue: auth }],
    });
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
  const signIn = (state: { academy?: boolean; admin?: boolean } = {}) => {
    auth.isLoggedIn.set(true);
    auth.user.set({ uid: 'u1', email: 'u1@indab.co' });
    auth.hasAcademyAccess.set(!!state.academy || !!state.admin);
    auth.isAdmin.set(!!state.admin);
  };

  it('gives every route a Spanish title for the browser tab', () => {
    for (const route of routes) {
      expect(route.title, route.path).toMatch(/INDAB|Eleva/);
    }
    expect(routes.at(-1)?.path).toBe('**');
  });

  it('lazy-loads a component for every route', async () => {
    for (const route of routes) {
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
    expect(await visit('/repository')).toBe('/login?returnUrl=%2Frepository');
    expect(await visit('/admin')).toBe('/login?returnUrl=%2Fadmin');
  });

  it('keeps students without access in the academy', async () => {
    signIn();
    expect(await visit('/academy')).toBe('/academy');
    expect(await visit('/repository')).toBe('/academy');
    expect(await visit('/admin')).toBe('/academy');
    expect(await visit('/login')).toBe('/academy');
    expect(await visit('/register')).toBe('/academy');
  });

  it('opens the material to enrolled students', async () => {
    signIn({ academy: true });
    expect(await visit('/repository')).toBe('/repository');
    expect(await visit('/admin')).toBe('/academy');
  });

  it('opens the admin area to admins', async () => {
    signIn({ admin: true });
    expect(await visit('/admin')).toBe('/admin');
  });
});
