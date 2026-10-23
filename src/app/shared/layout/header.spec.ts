import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Header } from './header';

describe('Header', () => {
  let fixture: ComponentFixture<Header>;
  const auth = {
    isLoggedIn: signal(false),
    hasAcademyAccess: signal(false),
    isAdmin: signal(false),
    signOut: vi.fn(async () => undefined),
  };

  beforeEach(async () => {
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

  const links = () =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('nav a')].map((a) =>
      a.getAttribute('href'),
    );
  const as = async (state: { academy?: boolean; admin?: boolean }) => {
    auth.isLoggedIn.set(true);
    auth.hasAcademyAccess.set(!!state.academy);
    auth.isAdmin.set(!!state.admin);
    await fixture.whenStable();
  };

  it('shows the login link to visitors', () => {
    expect(links()).toEqual(['/eleva', '/login']);
  });

  it('shows the academy to students, the material only with access', async () => {
    await as({});
    expect(links()).toEqual(['/eleva', '/academy']);
    await as({ academy: true });
    expect(links()).toEqual(['/eleva', '/academy', '/repository']);
  });

  it('shows the admin link to admins', async () => {
    await as({ academy: true, admin: true });
    expect(links()).toEqual(['/eleva', '/academy', '/repository', '/admin']);
  });

  it('signs out and goes home', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await as({});
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('nav button')!.click();
    await fixture.whenStable();
    expect(auth.signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
