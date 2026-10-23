import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let el: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  const auth = {
    signInWithEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    sendPasswordReset: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Login);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const type = (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  };
  const fill = (email: string, password: string) => {
    type('input[type=email]', email);
    type('input[type=password]', password);
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  const click = async (text: string) => {
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!.click();
    await fixture.whenStable();
  };
  const text = () => el.textContent ?? '';

  it('validates the form before calling Firebase', async () => {
    await submit();
    expect(auth.signInWithEmail).not.toHaveBeenCalled();
    expect(text()).toContain('Ingresa un correo válido.');

    fill('no-es-correo', 'secret');
    await submit();
    expect(auth.signInWithEmail).not.toHaveBeenCalled();
  });

  it('signs in and goes to the academy by default', async () => {
    fill('ana@indab.co', 'secret');
    await submit();
    expect(auth.signInWithEmail).toHaveBeenCalledWith('ana@indab.co', 'secret');
    expect(navigateByUrl).toHaveBeenCalledWith('/academy');
  });

  it('returns to the page the guard came from', async () => {
    fixture.componentRef.setInput('returnUrl', '/repository');
    fill('ana@indab.co', 'secret');
    await submit();
    expect(navigateByUrl).toHaveBeenCalledWith('/repository');
  });

  it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)', ''])(
    'ignores the unsafe return url %j',
    async (returnUrl) => {
      fixture.componentRef.setInput('returnUrl', returnUrl);
      fill('ana@indab.co', 'secret');
      await submit();
      expect(navigateByUrl).toHaveBeenCalledWith('/academy');
    },
  );

  it('shows a Spanish error and stays on the page when sign-in fails', async () => {
    auth.signInWithEmail.mockRejectedValue(new FirebaseError('auth/invalid-credential', ''));
    fill('ana@indab.co', 'wrong');
    await submit();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'Correo o contraseña incorrectos.',
    );
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);
  });

  it('signs in with Google', async () => {
    await click('Continuar con Google');
    expect(auth.signInWithGoogle).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/academy');
  });

  it('asks for the email before sending a password reset', async () => {
    await click('¿Olvidaste tu contraseña?');
    expect(auth.sendPasswordReset).not.toHaveBeenCalled();
    expect(text()).toContain('Escribe tu correo para recuperar la contraseña.');

    type('input[type=email]', 'ana@indab.co');
    await click('¿Olvidaste tu contraseña?');
    expect(auth.sendPasswordReset).toHaveBeenCalledWith('ana@indab.co');
    expect(el.querySelector('[role=status]')?.textContent).toContain('Te enviamos un correo');
    expect(el.querySelector('[role=alert]')).toBeNull();
  });

  it('reports password reset errors', async () => {
    auth.sendPasswordReset.mockRejectedValue(new FirebaseError('auth/too-many-requests', ''));
    type('input[type=email]', 'ana@indab.co');
    await click('¿Olvidaste tu contraseña?');
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Demasiados intentos.');
  });
});
