import { vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { quietFeatureFlags } from '../../core/features/testing';
import { PracticeService } from '../practice/practice.service';
import { Academy } from './academy';

describe('Academy', () => {
  const practice = { activeSessions: vi.fn(async () => [] as unknown[]) };
  const at = (ms: number) => ({ toMillis: () => ms });
  const auth = {
    user: signal({ uid: 'u1', email: 'ana@indab.co' }),
    profile: signal<{ displayName: string } | null>({ displayName: 'Ana' }),
    hasAcademyAccess: signal(false),
  };

  const render = async (flags = quietFeatureFlags()) => {
    TestBed.configureTestingModule({
      imports: [Academy],
      providers: [
        provideRouter([]),
        ...flags.providers,
        { provide: AuthService, useValue: auth },
        { provide: PracticeService, useValue: practice },
      ],
    });
    const fixture = TestBed.createComponent(Academy);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => practice.activeSessions.mockResolvedValue([]));

  it('leads back to practice the student left open', async () => {
    auth.hasAcademyAccess.set(true);
    practice.activeSessions.mockResolvedValue([
      { id: 's1', status: 'active', startedAt: at(Date.now()) },
    ]);
    const el = await render();
    expect(practice.activeSessions).toHaveBeenCalledWith('u1', 20);
    const banner = el.querySelector('a.open-practice[href="/academy/practice"]')!;
    expect(banner.textContent).toContain('Tienes una práctica abierta');
    expect(banner.textContent).toContain('Continuar práctica');
  });

  it('counts only the last free practice as open', async () => {
    auth.hasAcademyAccess.set(true);
    practice.activeSessions.mockResolvedValue([
      { id: 's2', status: 'active', startedAt: at(Date.now()) },
      { id: 's1', status: 'active', startedAt: at(Date.now() - 3.6e6) },
    ]);
    const el = await render();
    expect(el.querySelector('.open-practice')!.textContent).toContain(
      'Tienes una práctica abierta',
    );
  });

  it('shows the time an open evaluation has left, and not one whose time is up', async () => {
    auth.hasAcademyAccess.set(true);
    practice.activeSessions.mockResolvedValue([
      { id: 'e1_u1', status: 'active', durationMinutes: 30, startedAt: at(Date.now() - 600_000) },
      { id: 'e2_u1', status: 'active', durationMinutes: 30, startedAt: at(Date.now() - 3.6e6) },
    ]);
    const el = await render();
    const banner = el.querySelector('.open-practice')!.textContent!;
    expect(banner).toContain('Tienes una práctica abierta');
    expect(banner).toMatch(/Evaluación en curso: quedan (19:5\d|20:00)/);
  });

  it('does not look for open practice without academy access', async () => {
    auth.hasAcademyAccess.set(false);
    const el = await render();
    expect(practice.activeSessions).not.toHaveBeenCalled();
    expect(el.querySelector('.open-practice')).toBeNull();
  });

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

  it('leaves out the sections hidden at /admin/features, and their banner', async () => {
    auth.hasAcademyAccess.set(true);
    auth.profile.set({ displayName: 'Ana' });
    practice.activeSessions.mockResolvedValue([
      { id: 's1', status: 'active', startedAt: at(Date.now()) },
    ]);
    const el = await render(quietFeatureFlags({ practice: 'off', ranking: 'staff' }));
    const links = [...el.querySelectorAll('a.card')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/academy/material', '/academy/exams', '/academy/calendar']);
    expect(practice.activeSessions).not.toHaveBeenCalled();
    expect(el.querySelector('.open-practice')).toBeNull();
  });
});
