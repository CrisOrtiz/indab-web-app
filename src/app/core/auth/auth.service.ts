import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { FIREBASE_AUTH, FIRESTORE_LOADER } from '../firebase/firebase.providers';
import { I18n } from '../i18n/i18n.service';
import { Enrollment, UserProfile } from '../models/user-profile';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly firestore = inject(FIRESTORE_LOADER);

  // Firebase updates the same `User` object in place (name, linked providers), so every set
  // notifies, and `refreshUser()` can publish those changes.
  private readonly _user = signal<User | null>(null, { equal: () => false });
  private readonly _profile = signal<UserProfile | null>(null);
  private readonly _enrollment = signal<Enrollment | null>(null);
  private unsubscribeData: (() => void)[] = [];
  /** Bumped on every auth change, so a slow load for a previous user is dropped. */
  private generation = 0;

  readonly user = this._user.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly enrollment = this._enrollment.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._profile()?.role === 'admin');
  /** Trainers and admins: they run evaluations and review practice. */
  readonly isStaff = computed(() => this.isAdmin() || this._profile()?.role === 'trainer');
  readonly hasAcademyAccess = computed(
    () => this.isStaff() || this._enrollment()?.academy === true,
  );

  private settled: Promise<void>;

  constructor() {
    let resolveInitial!: () => void;
    this.settled = new Promise((resolve) => (resolveInitial = resolve));
    onAuthStateChanged(this.auth, (user) => {
      this._user.set(user);
      this.settled = this.watchUserData(user);
      this.settled.then(resolveInitial);
    });
    // Password reset emails and the Google sign-in window use the site's language.
    const i18n = inject(I18n);
    effect(() => (this.auth.languageCode = i18n.language()));
  }

  /** Resolves once the session is restored and the current user's profile and enrollment have loaded. */
  whenReady(): Promise<void> {
    return this.settled;
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async registerWithEmail(displayName: string, email: string, password: string): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(user, { displayName });
    await this.ensureProfile(user, displayName);
  }

  async signInWithGoogle(): Promise<void> {
    const { user } = await signInWithPopup(this.auth, new GoogleAuthProvider());
    await this.ensureProfile(user, user.displayName ?? '');
  }

  sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }

  /** Republishes the current user after it changed in place (e.g. a password was linked). */
  refreshUser(): void {
    this._user.set(this.auth.currentUser);
  }

  /** Creates `users/{uid}` on first sign-in. New users always start as students. */
  private async ensureProfile(user: User, displayName: string): Promise<void> {
    const [data, firestore] = await Promise.all([import('./user-data'), this.firestore.load()]);
    await data.ensureProfile(firestore, user, displayName);
  }

  /**
   * Subscribes to the signed-in user's profile and enrollment; resolves after the first load.
   * Loads Firestore first, so it is ready before the guards let the user into a page that uses it.
   */
  private async watchUserData(user: User | null): Promise<void> {
    const generation = ++this.generation;
    this.unsubscribeData.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeData = [];
    this._profile.set(null);
    this._enrollment.set(null);
    if (!user) {
      return;
    }

    let data: typeof import('./user-data');
    let firestore: Firestore;
    try {
      [data, firestore] = await Promise.all([import('./user-data'), this.firestore.load()]);
    } catch {
      // Offline or a stale deploy: carry on without the profile, as if it were missing.
      return;
    }
    if (generation !== this.generation) {
      return;
    }
    const { ready, unsubscribe } = data.watchUserData(
      firestore,
      user.uid,
      (profile) => this._profile.set(profile),
      (enrollment) => this._enrollment.set(enrollment),
    );
    this.unsubscribeData = unsubscribe;
    await ready;
  }
}
