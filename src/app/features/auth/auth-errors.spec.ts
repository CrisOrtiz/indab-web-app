import { FirebaseError } from 'firebase/app';
import { authErrorMessage } from './auth-errors';

describe('authErrorMessage', () => {
  it('translates known Firebase Auth errors', () => {
    expect(authErrorMessage(new FirebaseError('auth/invalid-credential', ''))).toBe(
      'Correo o contraseña incorrectos.',
    );
    for (const code of ['auth/wrong-password', 'auth/user-not-found']) {
      expect(authErrorMessage(new FirebaseError(code, ''))).toBe(
        'Correo o contraseña incorrectos.',
      );
    }
    expect(authErrorMessage(new FirebaseError('auth/email-already-in-use', ''))).toBe(
      'Ya existe una cuenta con este correo.',
    );
  });

  it('explains password-linking errors on the profile page', () => {
    expect(authErrorMessage(new FirebaseError('auth/requires-recent-login', ''))).toBe(
      'Por seguridad, vuelve a ingresar e inténtalo de nuevo.',
    );
    expect(authErrorMessage(new FirebaseError('auth/credential-already-in-use', ''))).toBe(
      'Ese correo ya está vinculado a otra cuenta.',
    );
    expect(authErrorMessage(new FirebaseError('auth/provider-already-linked', ''))).toBe(
      'Tu cuenta ya tiene una contraseña.',
    );
  });

  it('falls back to a generic message for anything else', () => {
    const generic = 'Ocurrió un error inesperado. Intenta de nuevo.';
    expect(authErrorMessage(new FirebaseError('auth/unknown-code', ''))).toBe(generic);
    expect(authErrorMessage(new Error('auth/invalid-credential'))).toBe(generic);
    expect(authErrorMessage('boom')).toBe(generic);
  });
});
