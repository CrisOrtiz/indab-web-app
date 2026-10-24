import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { vi } from 'vitest';
import { AuthService, SetupStep } from '../../core/auth/auth.service';
import { ProfileService } from '../profile/profile.service';
import { AccountSetup } from './account-setup';

describe('AccountSetup', () => {
  const auth = {
    user: signal({ uid: 'u1', email: 'ana@indab.co' }),
    isLoggedIn: signal(true),
    setupStep: signal<SetupStep | null>('verifyEmail'),
    checkEmailVerified: vi.fn(async () => false),
    sendVerificationEmail: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  };
  const profiles = { saveDetails: vi.fn(async (_details: unknown) => undefined) };
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    auth.setupStep.set('verifyEmail');
    auth.isLoggedIn.set(true);
  });

  const render = async (returnUrl?: string) => {
    TestBed.configureTestingModule({
      imports: [AccountSetup],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ProfileService, useValue: profiles },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AccountSetup);
    if (returnUrl) {
      fixture.componentRef.setInput('returnUrl', returnUrl);
    }
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const click = async (text: string) => {
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!.click();
      await fixture.whenStable();
    };
    return { fixture, el, click, stable: () => fixture.whenStable() };
  };

  it('asks to confirm the email and checks it on demand', async () => {
    const { el, click } = await render();
    expect(el.querySelector('h1')?.textContent).toBe('Confirma tu correo');
    expect(el.textContent).toContain('Te enviamos un enlace a ana@indab.co.');

    await click('Ya lo confirmé');
    expect(auth.checkEmailVerified).toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'Todavía no vemos la confirmación.',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('resends the email and reports errors', async () => {
    const { el, click } = await render();
    await click('Reenviar correo');
    expect(auth.sendVerificationEmail).toHaveBeenCalled();
    expect(el.querySelector('[role=status]')?.textContent).toContain('Te enviamos otro correo.');

    auth.sendVerificationEmail.mockRejectedValueOnce(
      new FirebaseError('auth/too-many-requests', ''),
    );
    await click('Reenviar correo');
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Demasiados intentos.');
  });

  it('checks again when the user comes back to the tab', async () => {
    await render();
    window.dispatchEvent(new Event('focus'));
    expect(auth.checkEmailVerified).toHaveBeenCalled();
  });

  it('asks for the birth date and saves the details', async () => {
    auth.setupStep.set('details');
    const { el, click } = await render();
    expect(el.querySelector('h1')?.textContent).toBe('Completa tus datos');
    await click('Guardar y continuar');
    expect(el.textContent).toContain('Ingresa tu fecha de nacimiento.');
    expect(profiles.saveDetails).not.toHaveBeenCalled();

    const date = el.querySelector<HTMLInputElement>('input[type=date]')!;
    date.value = '1992-11-03';
    date.dispatchEvent(new Event('input'));
    await click('Guardar y continuar');
    expect(profiles.saveDetails).toHaveBeenCalledWith({ birthDate: '1992-11-03', whatsapp: '' });
  });

  it('goes on to the page the user asked for once nothing is left', async () => {
    const { stable } = await render('/academy/practice');
    auth.setupStep.set(null);
    await stable();
    expect(navigate).toHaveBeenCalledWith('/academy/practice');
  });

  it('never follows an external return url', async () => {
    const { stable } = await render('//evil.example');
    auth.setupStep.set(null);
    await stable();
    expect(navigate).toHaveBeenCalledWith('/academy');
  });

  it('signs out', async () => {
    const { click } = await render();
    await click('Cerrar sesión');
    expect(auth.signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
