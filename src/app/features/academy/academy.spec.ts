import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Academy } from './academy';

describe('Academy', () => {
  const auth = {
    user: signal({ email: 'ana@indab.co' }),
    profile: signal<{ displayName: string } | null>({ displayName: 'Ana' }),
    hasAcademyAccess: signal(false),
  };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [Academy],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(Academy);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the pending notice without academy access', async () => {
    auth.hasAcademyAccess.set(false);
    const el = await render();
    expect(el.querySelector('h1')?.textContent).toContain('Hola, Ana');
    expect(el.textContent).toContain('Tu inscripción está pendiente.');
    expect(el.querySelector('a[href="/academy/material"]')).toBeNull();
    expect(el.querySelector('a[href="/academy/practice"]')).toBeNull();
    // The sections still show, locked, so students see what is coming; the calendar is public.
    expect(el.querySelectorAll('.card.locked')).toHaveLength(4);
    expect(el.querySelector('a.card[href="/academy/calendar"]')).not.toBeNull();
    expect(el.textContent).toContain('Se habilita con tu inscripción');
  });

  it('shows a card for each section with academy access', async () => {
    auth.hasAcademyAccess.set(true);
    auth.profile.set(null);
    const el = await render();
    expect(el.querySelector('h1')?.textContent).toContain('Hola, ana@indab.co');
    const links = [...el.querySelectorAll('a.card')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/academy/material',
      '/academy/practice',
      '/academy/exams',
      '/academy/ranking',
      '/academy/calendar',
    ]);
    const practice = el.querySelector('a[href="/academy/practice"]');
    expect(practice?.querySelector('h2')?.textContent).toBe('Práctica de trading');
    expect(practice?.textContent).toContain('200 USD');
    expect(el.querySelector('.locked')).toBeNull();
  });
});
