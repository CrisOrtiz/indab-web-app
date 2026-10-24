import { Injectable, inject } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { PersonalDetails } from '../../core/models/user-profile';
import { FIREBASE_AUTH, FIRESTORE } from '../../core/firebase/firebase.providers';
import { resizeImage } from '../../shared/avatar/resize-image';

/** Firebase sign-in methods we offer, by provider id. */
export type SignInMethod = 'password' | 'google.com';

/** The sign-in methods linked to this account. */
export function signInMethods(user: User | null): SignInMethod[] {
  const ids = user?.providerData.map((p) => p.providerId) ?? [];
  return (['password', 'google.com'] as const).filter((id) => ids.includes(id));
}

/**
 * The signed-in user's own account settings: name, details, photo and password. Profile fields are
 * written to `users/{uid}` (see `firestore.rules`); passwords go to Firebase Auth only.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly firestore = inject(FIRESTORE);
  private readonly authService = inject(AuthService);

  /** Saves the name and details from the profile's personal data form. */
  async updatePersonal(displayName: string, details: PersonalDetails): Promise<void> {
    const user = this.currentUser();
    await updateDoc(doc(this.firestore, 'users', user.uid), {
      displayName,
      ...detailUpdate(details),
    });
    if (user.displayName !== displayName) {
      await updateProfile(user, { displayName });
      this.authService.refreshUser();
    }
  }

  /** Saves the details the account setup page asks for. */
  async saveDetails(details: PersonalDetails): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', this.currentUser().uid), detailUpdate(details));
  }

  /** Shrinks the picked image (see `resizeImage`) and saves it as the profile photo. */
  async uploadPhoto(file: File): Promise<void> {
    const photoURL = await resizeImage(file);
    await updateDoc(doc(this.firestore, 'users', this.currentUser().uid), { photoURL });
  }

  /** Removes the uploaded photo; the Google photo (if any) shows again. */
  async removePhoto(): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', this.currentUser().uid), {
      photoURL: deleteField(),
    });
  }

  /**
   * Adds email + password sign-in to an account that only signs in with Google. Firebase
   * asks for a recent sign-in first, so after a while the Google window opens once more.
   */
  async setPassword(password: string): Promise<void> {
    const user = this.currentUser();
    const credential = EmailAuthProvider.credential(user.email!, password);
    try {
      await linkWithCredential(user, credential);
    } catch (e) {
      if (!(e instanceof FirebaseError && e.code === 'auth/requires-recent-login')) {
        throw e;
      }
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
      await linkWithCredential(user, credential);
    }
    this.authService.refreshUser();
  }

  /** Changes the password after checking the current one. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.currentUser();
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email!, currentPassword),
    );
    await updatePassword(user, newPassword);
  }

  private currentUser(): User {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Not signed in');
    }
    return user;
  }
}

/** An empty WhatsApp number removes the stored one. */
function detailUpdate(details: PersonalDetails) {
  return {
    birthDate: details.birthDate,
    whatsapp: details.whatsapp || deleteField(),
  };
}
