import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { INSTALL_OFFER_ENABLED } from '../../core/pwa/app-install.service';
import { Header } from './header';
import { LandingSections } from './landing-sections';
import { quietNotifications } from '../../features/notifications/testing';

describe('Header', () => {
  let fixture: ComponentFixture<Header>;
  const auth = {
    user: signal<{ email: string; displayName?: string; photoURL?: string } | null>(null),
    profile: signal<{ displayName: string; photoURL?: string } | null>(null),
    isLoggedIn: signal(false),
    hasAcademyAccess: signal(false),
    isAdmin: signal(false),
    isStaff: signal(false),
    signOut: vi.fn(async () => undefined),
  };

  beforeEach(async () => {
    auth.user.set(null);
    auth.profile.set(null);
    auth.isLoggedIn.set(false);
    auth.hasAcademyAccess.set(false);
    auth.isAdmin.set(false);
    auth.isStaff.set(false);
    TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        ...quietNotifications().providers,
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        // The option is off on the site for now; these tests cover it switched on.
        { provide: INSTALL_OFFER_ENABLED, useValue: true },
      ],
    });
    fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const links = () => [...el().querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
  const avatarButton = () => el().querySelector<HTMLButtonElement>('.avatar-button');
  const menu = () => el().querySelector('[role="menu"]');
  const as = async (state: { academy?: boolean; admin?: boolean; trainer?: boolean } = {}) => {
    auth.isLoggedIn.set(true);
    auth.user.set({ email: 'ana@indab.co' });
    auth.profile.set({ displayName: 'Ana Pérez' });
    auth.hasAcademyAccess.set(!!state.academy);
    auth.isAdmin.set(!!state.admin);
    auth.isStaff.set(!!state.admin || !!state.trainer);
    await fixture.whenStable();
  };
  const openMenu = async () => {
    avatarButton()!.click();
    await fixture.whenStable();
  };

  it('shows the login link to visitors, and no account menu', () => {
    expect(links()).toEqual(['/#nosotros', '/#contacto', '/calendar', '/login']);
    expect(avatarButton()).toBeNull();
  });

  it('shows the academy to students, without a separate material link', async () => {
    await as({});
    expect(links()).toEqual(['/#nosotros', '/#contacto', '/calendar', '/academy']);
    await as({ academy: true });
    expect(links()).toEqual(['/#nosotros', '/#contacto', '/calendar', '/academy']);
  });

  it('shows the admin link to admins', async () => {
    await as({ academy: true, admin: true });
    expect(links()).toEqual(['/#nosotros', '/#contacto', '/calendar', '/academy', '/admin']);
    // Phones show the short label; screen readers always get the full one.
    const admin = el().querySelector('nav a[href="/admin"]')!;
    expect(admin.getAttribute('aria-label')).toBe('Administración');
    expect(admin.querySelector('.short')!.textContent).toBe('Admin');
  });

  it('links everyone to the public calendar, an icon on phones', () => {
    const calendar = el().querySelector('nav a[href="/calendar"]')!;
    expect(calendar.getAttribute('aria-label')).toBe('Calendario');
    expect(calendar.querySelector('.long')!.textContent).toBe('Calendario');
    expect(calendar.querySelector('app-icon.short')).not.toBeNull();
  });

  it('marks the current section for the underline and screen readers', async () => {
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: 'academy', children: [] },
      { path: 'profile', children: [] },
    ]);
    await as({ academy: true });
    const nav = el().querySelector('nav')!;
    expect(nav.classList).not.toContain('has-active');

    await router.navigateByUrl('/academy');
    await fixture.whenStable();
    const current = el().querySelector('nav a[aria-current="page"]')!;
    expect(current.getAttribute('href')).toBe('/academy');
    expect(current.classList).toContain('active');
    expect(nav.classList).toContain('has-active');
    expect(nav.querySelector('.indicator')!.getAttribute('aria-hidden')).toBe('true');

    await router.navigateByUrl('/profile');
    await fixture.whenStable();
    expect(el().querySelector('nav a[aria-current]')).toBeNull();
    expect(nav.classList).not.toContain('has-active');
  });

  it('links to the about and contact sections of the landing, without Eleva', () => {
    const names = [...el().querySelectorAll('nav a')].map((a) => a.textContent?.trim());
    expect(names).toEqual(['Nosotros', 'Contáctanos', 'Calendario', 'Ingresar']);
    expect(el().querySelector('nav a[href="/eleva"]')).toBeNull();
  });

  it('underlines the landing section on screen', async () => {
    const sections = TestBed.inject(LandingSections);
    const nav = el().querySelector('nav')!;
    sections.current.set('contacto');
    await fixture.whenStable();
    const current = el().querySelector('nav a[aria-current="location"]')!;
    expect(current.getAttribute('href')).toBe('/#contacto');
    expect(current.classList).toContain('active');
    expect(nav.classList).toContain('has-active');

    sections.current.set('programas');
    await fixture.whenStable();
    expect(el().querySelector('nav a[aria-current]')).toBeNull();
    expect(nav.classList).not.toContain('has-active');
    sections.current.set(null);
  });

  it('scrolls to a section already on the page, as the router skips the same fragment', async () => {
    const section = document.createElement('section');
    section.id = 'contacto';
    section.scrollIntoView = vi.fn();
    document.body.append(section);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    el().querySelector<HTMLAnchorElement>('nav a[href="/#contacto"]')!.click();
    expect(section.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    section.remove();
  });

  it('gets thinner with a shadow once the page scrolls, and back at the top', async () => {
    const scrollTo = async (y: number) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
      window.dispatchEvent(new Event('scroll'));
      await fixture.whenStable();
    };
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList).not.toContain('scrolled');
    await scrollTo(20);
    expect(host.classList).not.toContain('scrolled');
    await scrollTo(200);
    expect(host.classList).toContain('scrolled');
    await scrollTo(20);
    expect(host.classList).toContain('scrolled');
    await scrollTo(0);
    expect(host.classList).not.toContain('scrolled');
  });

  it('shows the admin link to trainers', async () => {
    await as({ academy: true, trainer: true });
    expect(links()).toEqual(['/#nosotros', '/#contacto', '/calendar', '/academy', '/admin']);
  });

  it('shows the initials, the Google photo or the uploaded photo', async () => {
    await as();
    expect(avatarButton()!.getAttribute('aria-label')).toBe('Tu cuenta');
    expect(avatarButton()!.querySelector('img')).toBeNull();
    expect(avatarButton()!.textContent?.trim()).toBe('AP');

    auth.user.set({ email: 'ana@indab.co', photoURL: 'https://google.test/ana.jpg' });
    await fixture.whenStable();
    expect(avatarButton()!.querySelector('img')!.getAttribute('src')).toBe(
      'https://google.test/ana.jpg',
    );

    auth.profile.set({ displayName: 'Ana Pérez', photoURL: 'data:image/jpeg;base64,AAAA' });
    await fixture.whenStable();
    expect(avatarButton()!.querySelector('img')!.getAttribute('src')).toBe(
      'data:image/jpeg;base64,AAAA',
    );
  });

  it('opens a menu with the profile link and sign-out', async () => {
    await as();
    expect(menu()).toBeNull();
    await openMenu();
    expect(avatarButton()!.getAttribute('aria-expanded')).toBe('true');
    expect(menu()!.textContent).toContain('Ana Pérez');
    expect(menu()!.textContent).toContain('ana@indab.co');
    const items = [...menu()!.querySelectorAll('[role="menuitem"]')];
    expect(items.map((i) => i.textContent?.trim())).toEqual(['Mi perfil', 'Cerrar sesión']);
    expect(items[0].getAttribute('href')).toBe('/profile');
  });

  it('switches light and dark mode from the menu, keeping it open', async () => {
    localStorage.clear();
    await as();
    await openMenu();
    const options = [...menu()!.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Sistema', 'Claro', 'Oscuro']);
    options[2].click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(menu()).not.toBeNull();
    options[1].click();
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('closes the menu on Escape, an outside click or a second click', async () => {
    await as();
    await openMenu();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(menu()).toBeNull();

    await openMenu();
    document.body.click();
    await fixture.whenStable();
    expect(menu()).toBeNull();

    await openMenu();
    menu()!.querySelector<HTMLElement>('.who')!.click();
    await fixture.whenStable();
    expect(menu()).not.toBeNull();
    await openMenu();
    expect(menu()).toBeNull();
  });

  it('signs out from the menu and goes home', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await as();
    await openMenu();
    menu()!.querySelector<HTMLButtonElement>('button[role="menuitem"]')!.click();
    await fixture.whenStable();
    expect(auth.signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(menu()).toBeNull();
  });

  it('offers "Install app" in the menu when the browser can install the site', async () => {
    await as();
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(event);
    await openMenu();
    const items = [...menu()!.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      'Mi perfil',
      'Instalar app',
      'Cerrar sesión',
    ]);
    items[1].click();
    await fixture.whenStable();
    expect(event.prompt).toHaveBeenCalled();
    expect(menu()).toBeNull();
  });
});
