import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Header } from './header';

describe('Header', () => {
  let fixture: ComponentFixture<Header>;
  const auth = {
    user: signal<{ email: string; displayName?: string; photoURL?: string } | null>(null),
    profile: signal<{ displayName: string; photoURL?: string } | null>(null),
    isLoggedIn: signal(false),
    hasAcademyAccess: signal(false),
    isAdmin: signal(false),
    signOut: vi.fn(async () => undefined),
  };

  beforeEach(async () => {
    auth.user.set(null);
    auth.profile.set(null);
    auth.isLoggedIn.set(false);
    auth.hasAcademyAccess.set(false);
    auth.isAdmin.set(false);
    TestBed.configureTestingModule({
      imports: [Header],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const links = () => [...el().querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
  const avatarButton = () => el().querySelector<HTMLButtonElement>('.avatar-button');
  const menu = () => el().querySelector('[role="menu"]');
  const as = async (state: { academy?: boolean; admin?: boolean } = {}) => {
    auth.isLoggedIn.set(true);
    auth.user.set({ email: 'ana@indab.co' });
    auth.profile.set({ displayName: 'Ana Pérez' });
    auth.hasAcademyAccess.set(!!state.academy);
    auth.isAdmin.set(!!state.admin);
    await fixture.whenStable();
  };
  const openMenu = async () => {
    avatarButton()!.click();
    await fixture.whenStable();
  };

  it('shows the login link to visitors, and no account menu', () => {
    expect(links()).toEqual(['/eleva', '/login']);
    expect(avatarButton()).toBeNull();
  });

  it('shows the academy to students, without a separate material link', async () => {
    await as({});
    expect(links()).toEqual(['/eleva', '/academy']);
    await as({ academy: true });
    expect(links()).toEqual(['/eleva', '/academy']);
  });

  it('shows the admin link to admins', async () => {
    await as({ academy: true, admin: true });
    expect(links()).toEqual(['/eleva', '/academy', '/admin']);
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
    menu()!.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    expect(auth.signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(menu()).toBeNull();
  });
});
