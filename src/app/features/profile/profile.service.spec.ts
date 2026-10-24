import { TestBed } from '@angular/core/testing';
import { FirebaseError } from 'firebase/app';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIREBASE_AUTH, FIRESTORE } from '../../core/firebase/firebase.providers';
import { ProfileService, signInMethods } from './profile.service';

vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: vi.fn((email, password) => ({ email, password })) },
  GoogleAuthProvider: class {},
  linkWithCredential: vi.fn(async () => undefined),
  reauthenticateWithCredential: vi.fn(async () => undefined),
  reauthenticateWithPopup: vi.fn(async () => undefined),
  updatePassword: vi.fn(async () => undefined),
  updateProfile: vi.fn(async () => undefined),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection: string, id: string) => ({ path: `${collection}/${id}` })),
  updateDoc: vi.fn(async () => undefined),
  deleteField: vi.fn(() => 'DELETE_FIELD'),
}));

import * as auth from 'firebase/auth';
import { updateDoc } from 'firebase/firestore';

describe('signInMethods', () => {
  const user = (...ids: string[]) =>
    ({ providerData: ids.map((providerId) => ({ providerId })) }) as unknown as auth.User;

  it('lists the linked password and Google sign-in', () => {
    expect(signInMethods(user('google.com'))).toEqual(['google.com']);
    expect(signInMethods(user('google.com', 'password'))).toEqual(['password', 'google.com']);
    expect(signInMethods(user('phone'))).toEqual([]);
    expect(signInMethods(null)).toEqual([]);
  });
});

describe('ProfileService', () => {
  let service: ProfileService;
  const currentUser = { uid: 'u1', email: 'ana@indab.co' };
  const firebaseAuth = { currentUser: currentUser as unknown };
  const authService = { refreshUser: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    firebaseAuth.currentUser = currentUser;
    TestBed.configureTestingModule({
      providers: [
        { provide: FIREBASE_AUTH, useValue: firebaseAuth },
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: authService },
      ],
    });
    service = TestBed.inject(ProfileService);
  });

  it('saves the name in the profile and in Firebase Auth', async () => {
    await service.updateDisplayName('Ana María');
    expect(updateDoc).toHaveBeenCalledWith({ path: 'users/u1' }, { displayName: 'Ana María' });
    expect(auth.updateProfile).toHaveBeenCalledWith(currentUser, { displayName: 'Ana María' });
    expect(authService.refreshUser).toHaveBeenCalled();
  });

  it('shrinks and saves the photo, and removes it', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,AAAA',
    );
    await service.uploadPhoto(new File(['x'], 'me.png', { type: 'image/png' }));
    vi.unstubAllGlobals();
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'users/u1' },
      { photoURL: 'data:image/jpeg;base64,AAAA' },
    );
    await service.removePhoto();
    expect(updateDoc).toHaveBeenLastCalledWith({ path: 'users/u1' }, { photoURL: 'DELETE_FIELD' });
  });

  it('does not save files that are not images', async () => {
    await expect(
      service.uploadPhoto(new File(['x'], 'a.pdf', { type: 'application/pdf' })),
    ).rejects.toMatchObject({ reason: 'notImage' });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('links an email password to a Google account', async () => {
    await service.setPassword('secreto123');
    expect(auth.linkWithCredential).toHaveBeenCalledWith(currentUser, {
      email: 'ana@indab.co',
      password: 'secreto123',
    });
    expect(auth.reauthenticateWithPopup).not.toHaveBeenCalled();
    expect(authService.refreshUser).toHaveBeenCalled();
  });

  it('asks Google again when Firebase wants a recent sign-in', async () => {
    vi.mocked(auth.linkWithCredential).mockRejectedValueOnce(
      new FirebaseError('auth/requires-recent-login', 'old'),
    );
    await service.setPassword('secreto123');
    expect(auth.reauthenticateWithPopup).toHaveBeenCalledOnce();
    expect(auth.linkWithCredential).toHaveBeenCalledTimes(2);
  });

  it('passes other linking errors to the caller', async () => {
    vi.mocked(auth.linkWithCredential).mockRejectedValueOnce(
      new FirebaseError('auth/weak-password', 'weak'),
    );
    await expect(service.setPassword('123')).rejects.toMatchObject({ code: 'auth/weak-password' });
    expect(auth.reauthenticateWithPopup).not.toHaveBeenCalled();
    expect(authService.refreshUser).not.toHaveBeenCalled();
  });

  it('checks the current password before changing it', async () => {
    await service.changePassword('viejo123', 'nuevo456');
    expect(auth.reauthenticateWithCredential).toHaveBeenCalledWith(currentUser, {
      email: 'ana@indab.co',
      password: 'viejo123',
    });
    expect(auth.updatePassword).toHaveBeenCalledWith(currentUser, 'nuevo456');

    vi.mocked(auth.reauthenticateWithCredential).mockRejectedValueOnce(
      new FirebaseError('auth/invalid-credential', 'bad'),
    );
    vi.mocked(auth.updatePassword).mockClear();
    await expect(service.changePassword('mal', 'nuevo456')).rejects.toBeInstanceOf(FirebaseError);
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it('needs a signed-in user', async () => {
    firebaseAuth.currentUser = null;
    await expect(service.removePhoto()).rejects.toThrow('Not signed in');
  });
});
