import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { PracticeSession } from '../../core/models/practice';
import { PracticeService } from '../practice/practice.service';
import { PRACTICE_SESSIONS, Profile } from './profile';
import { ProfileService } from './profile.service';

import { PhotoError } from '../../shared/avatar/resize-image';

type FakeUser = {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  providerData: { providerId: string }[];
  metadata: { creationTime?: string };
};

describe('Profile', () => {
  const googleUser = (): FakeUser => ({
    uid: 'u1',
    email: 'ana@indab.co',
    displayName: 'Ana Google',
    photoURL: 'https://google.test/ana.jpg',
    providerData: [{ providerId: 'google.com' }],
    metadata: { creationTime: '2026-10-01T12:00:00Z' },
  });

  const auth = {
    user: signal<FakeUser | null>(null),
    profile: signal<Record<string, unknown> | null>(null),
    isAdmin: signal(false),
    hasAcademyAccess: signal(false),
    whenReady: () => Promise.resolve(),
    sendPasswordReset: vi.fn(async (_email: string) => undefined),
  };
  const profiles = {
    updateDisplayName: vi.fn(async (_name: string) => undefined),
    uploadPhoto: vi.fn(async (_file: File) => undefined),
    removePhoto: vi.fn(async () => undefined),
    setPassword: vi.fn(async (_password: string) => undefined),
    changePassword: vi.fn(async (_current: string, _next: string) => undefined),
  };
  const practice = {
    mySessions: vi.fn(async (_uid: string, _max: number) => [] as PracticeSession[]),
  };

  const session = (id: string, pnl: number, tradeCount: number, status = 'finished') =>
    ({
      id,
      pnl,
      tradeCount,
      status,
      symbol: 'PAXGUSDT',
      startedAt: { toDate: () => new Date('2026-10-20T12:00:00Z') },
    }) as unknown as PracticeSession;

  beforeEach(() => {
    vi.clearAllMocks();
    auth.user.set(googleUser());
    auth.profile.set({
      uid: 'u1',
      displayName: 'Ana Pérez',
      role: 'student',
      createdAt: { toDate: () => new Date('2026-10-05T12:00:00Z') },
    });
    auth.isAdmin.set(false);
    auth.hasAcademyAccess.set(true);
    practice.mySessions.mockResolvedValue([]);
  });

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [Profile],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ProfileService, useValue: profiles },
        { provide: PracticeService, useValue: practice },
      ],
    });
    const fixture = TestBed.createComponent(Profile);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const stable = () => fixture.whenStable();
    return { fixture, el, stable };
  };

  const input = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.trim().startsWith(label))
      ?.querySelector<HTMLInputElement>('input, select') as HTMLInputElement;
  const type = (field: HTMLInputElement, value: string) => {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };
  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll('button, label.btn')].find((b) => b.textContent?.trim() === text) as
      HTMLElement | undefined;

  it('shows who the user is, their role, access and join date', async () => {
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent).toBe('Mi perfil');
    expect(el.querySelector('.who h2')?.textContent).toBe('Ana Pérez');
    expect(el.textContent).toContain('ana@indab.co');
    expect(el.textContent).toContain('Estudiante');
    expect(el.textContent).toContain('Habilitado');
    expect(el.textContent).toContain('5 oct 2026');
    // The Google photo shows until one is uploaded.
    expect(el.querySelector('app-avatar img')?.getAttribute('src')).toBe(
      'https://google.test/ana.jpg',
    );
    expect(button(el, 'Quitar foto')).toBeUndefined();
  });

  it('shows pending access and admins', async () => {
    auth.hasAcademyAccess.set(false);
    const { el, stable } = await render();
    expect(el.textContent).toContain('Pendiente de activación');
    expect(el.textContent).toContain(
      'La práctica de trading se habilita cuando el equipo de INDAB activa tu acceso a la academia.',
    );
    auth.isAdmin.set(true);
    auth.hasAcademyAccess.set(true);
    await stable();
    expect(el.textContent).toContain('Administrador');
    expect(el.textContent).toContain('Incluido (administrador)');
  });

  it('uploads a resized photo and can remove it', async () => {
    const { el, stable } = await render();
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    const picker = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(picker, 'files', { value: [file] });
    picker.dispatchEvent(new Event('change'));
    await stable();
    expect(profiles.uploadPhoto).toHaveBeenCalledWith(file);
    expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe('Foto actualizada.');

    auth.profile.update((p) => ({ ...p, photoURL: 'data:image/jpeg;base64,AAAA' }));
    await stable();
    expect(el.querySelector('app-avatar img')?.getAttribute('src')).toBe(
      'data:image/jpeg;base64,AAAA',
    );
    button(el, 'Quitar foto')!.click();
    await stable();
    expect(profiles.removePhoto).toHaveBeenCalled();
    expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe('Foto eliminada.');
  });

  it('explains why a photo was rejected', async () => {
    profiles.uploadPhoto.mockRejectedValueOnce(new PhotoError('unreadable'));
    const { el, stable } = await render();
    const picker = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(picker, 'files', { value: [new File(['x'], 'a.heic')] });
    picker.dispatchEvent(new Event('change'));
    await stable();
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'No pudimos leer esa imagen. Prueba con un JPG o PNG.',
    );
  });

  it('edits the name', async () => {
    const { el, stable } = await render();
    const name = input(el, 'Nombre completo');
    expect(name.value).toBe('Ana Pérez');
    type(name, '   ');
    button(el, 'Guardar nombre')!.click();
    await stable();
    expect(profiles.updateDisplayName).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Ingresa tu nombre');

    type(name, '  Ana María Pérez ');
    button(el, 'Guardar nombre')!.click();
    await stable();
    expect(profiles.updateDisplayName).toHaveBeenCalledWith('Ana María Pérez');
    expect(el.textContent).toContain('Nombre actualizado.');
  });

  it('lets a Google user create a password', async () => {
    const { el, stable } = await render();
    expect(el.textContent).toContain('Ingresas con Google.');
    expect(input(el, 'Contraseña actual')).toBeUndefined();
    type(input(el, 'Nueva contraseña'), 'secreto123');
    type(input(el, 'Repite la nueva contraseña'), 'otra-cosa');
    button(el, 'Crear contraseña')!.click();
    await stable();
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Las contraseñas no coinciden.',
    );

    type(input(el, 'Repite la nueva contraseña'), 'secreto123');
    button(el, 'Crear contraseña')!.click();
    await stable();
    expect(profiles.setPassword).toHaveBeenCalledWith('secreto123');
    expect(el.textContent).toContain('Ya puedes ingresar con tu correo y contraseña.');
    expect(input(el, 'Nueva contraseña').value).toBe('');
  });

  it('changes an existing password after asking for the current one', async () => {
    auth.user.set({ ...googleUser(), photoURL: null, providerData: [{ providerId: 'password' }] });
    const { el, stable } = await render();
    expect(el.querySelector('.methods')?.textContent).toContain('Correo y contraseña');
    expect(el.querySelector('.methods')?.textContent).not.toContain('Google');
    type(input(el, 'Nueva contraseña'), 'nuevo456');
    type(input(el, 'Repite la nueva contraseña'), 'nuevo456');
    button(el, 'Cambiar contraseña')!.click();
    await stable();
    expect(el.textContent).toContain('Ingresa tu contraseña actual.');
    expect(profiles.changePassword).not.toHaveBeenCalled();

    profiles.changePassword.mockRejectedValueOnce(new FirebaseError('auth/invalid-credential', ''));
    type(input(el, 'Contraseña actual'), 'mal');
    button(el, 'Cambiar contraseña')!.click();
    await stable();
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Correo o contraseña incorrectos.',
    );

    type(input(el, 'Contraseña actual'), 'viejo123');
    button(el, 'Cambiar contraseña')!.click();
    await stable();
    expect(profiles.changePassword).toHaveBeenLastCalledWith('viejo123', 'nuevo456');
    expect(el.textContent).toContain('Contraseña actualizada.');
  });

  it('emails a reset link when the current password is forgotten', async () => {
    auth.user.set({ ...googleUser(), providerData: [{ providerId: 'password' }] });
    const { el, stable } = await render();
    button(el, '¿No recuerdas tu contraseña actual?')!.click();
    await stable();
    expect(auth.sendPasswordReset).toHaveBeenCalledWith('ana@indab.co');
    expect(el.textContent).toContain('Te enviamos un correo a ana@indab.co para restablecerla.');
  });

  it('sums up the practice P/L and lists the latest sessions', async () => {
    practice.mySessions.mockResolvedValue([
      session('s1', 25.5, 4, 'active'),
      session('s2', -10.25, 3),
      session('s3', 4, 1),
    ]);
    const { el } = await render();
    expect(practice.mySessions).toHaveBeenCalledWith('u1', PRACTICE_SESSIONS);
    const stats = el.querySelector('.stats')!.textContent!;
    expect(stats).toContain('+19.25 USD');
    expect(stats).toContain('2 / 3');
    expect(stats).toContain('8');
    expect(stats).toContain('+25.50');
    expect(stats).toContain('-10.25');
    expect(el.querySelector('.big')?.classList).toContain('up');
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Oro (XAU/USD vía PAXG)');
    expect(rows[0].textContent).toContain('En curso');
    expect(rows[1].querySelector('.down')?.textContent?.trim()).toBe('-10.25');
    expect(el.textContent).toContain('Saldo simulado en USD, no es dinero real.');
  });

  it('invites students with access to their first practice', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('Aún no tienes prácticas.');
    expect(el.querySelector('a[href="/academy/practice"]')?.textContent?.trim()).toBe(
      'Ir a la práctica',
    );
  });

  it('says so when the practice cannot load', async () => {
    practice.mySessions.mockRejectedValue(new Error('offline'));
    const { el } = await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos cargar tus prácticas.',
    );
  });

  it('switches the site language', async () => {
    const { el, stable } = await render();
    const select = input(el, 'Idioma del sitio') as unknown as HTMLSelectElement;
    select.value = 'en-US';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(async () => {
      await stable();
      expect(el.querySelector('h1')?.textContent).toBe('My profile');
    });
  });
});
