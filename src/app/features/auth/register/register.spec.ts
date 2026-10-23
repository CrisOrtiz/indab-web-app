import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { Register } from './register';

describe('Register', () => {
  let fixture: ComponentFixture<Register>;
  let el: HTMLElement;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  const auth = { registerWithEmail: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Register);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const fill = (values: { name: string; email: string; password: string }) => {
    const set = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set('input[autocomplete=name]', values.name);
    set('input[type=email]', values.email);
    set('input[type=password]', values.password);
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  const valid = { name: '  José Pérez ', email: 'jose@indab.co', password: 'secret1' };

  it('shows field errors and does not register an invalid form', async () => {
    await submit();
    expect(el.textContent).toContain('Ingresa tu nombre.');
    expect(el.textContent).toContain('Ingresa un correo válido.');
    expect(auth.registerWithEmail).not.toHaveBeenCalled();
  });

  it('requires a password of at least 6 characters and a name up to 80', async () => {
    fill({ ...valid, password: '12345' });
    await submit();
    fill({ ...valid, name: 'x'.repeat(81) });
    await submit();
    expect(auth.registerWithEmail).not.toHaveBeenCalled();
  });

  it('registers with a trimmed name and opens the academy', async () => {
    fill(valid);
    await submit();
    expect(auth.registerWithEmail).toHaveBeenCalledWith('José Pérez', 'jose@indab.co', 'secret1');
    expect(navigateByUrl).toHaveBeenCalledWith('/academy');
  });

  it('shows the error when the email is taken', async () => {
    auth.registerWithEmail.mockRejectedValue(new FirebaseError('auth/email-already-in-use', ''));
    fill(valid);
    await submit();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'Ya existe una cuenta con este correo.',
    );
  });
});
