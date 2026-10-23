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

  it('falls back to a generic message for anything else', () => {
    const generic = 'Ocurrió un error inesperado. Intenta de nuevo.';
    expect(authErrorMessage(new FirebaseError('auth/unknown-code', ''))).toBe(generic);
    expect(authErrorMessage(new Error('auth/invalid-credential'))).toBe(generic);
    expect(authErrorMessage('boom')).toBe(generic);
  });
});
