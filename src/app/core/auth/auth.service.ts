import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { FIREBASE_AUTH, FIRESTORE_LOADER } from '../firebase/firebase.providers';
import { I18n } from '../i18n/i18n.service';
import { Enrollment, PersonalDetails, UserProfile } from '../models/user-profile';
import type { TrackedSession } from './session-tracker';

/**
 * What a signed-in user still has to do before entering: confirm the email they registered
 * with, then give the details asked at registration (Google and older accounts lack them).
 */
export type SetupStep = 'verifyEmail' | 'details';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly firestore = inject(FIRESTORE_LOADER);

  // Firebase updates the same `User` object in place (name, linked providers), so every set
  // notifies, and `refreshUser()` can publish those changes.
  private readonly _user = signal<User | null>(null, { equal: () => false });
  private readonly _profile = signal<UserProfile | null>(null);
  private readonly _enrollment = signal<Enrollment | null>(null);
  private readonly _sessionId = signal<string | null>(null);
  private session: TrackedSession | null = null;
  private readonly router = inject(Router);
  private unsubscribeData: (() => void)[] = [];
  /** Bumped on every auth change, so a slow load for a previous user is dropped. */
  private generation = 0;

  readonly user = this._user.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly enrollment = this._enrollment.asReadonly();
  /** This browser's entry in `users/{uid}/sessions`, once recorded. */
  readonly sessionId = this._sessionId.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._profile()?.role === 'admin');
  /** Trainers and admins: they run evaluations and review practice. */
  readonly isStaff = computed(() => this.isAdmin() || this._profile()?.role === 'trainer');
  readonly hasAcademyAccess = computed(
    () => this.isStaff() || this._enrollment()?.academy === true,
  );

  /** Null when the account is ready; guards send the user to `/account-setup` otherwise. */
  readonly setupStep = computed<SetupStep | null>(() => {
    const user = this._user();
    if (!user) {
      return null;
    }
    if (!user.emailVerified) {
      return 'verifyEmail';
    }
    const profile = this._profile();
    // A missing profile (offline, denied) is not asked for: there would be nothing to save to.
    return profile && !profile.birthDate ? 'details' : null;
  });

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

  async registerWithEmail(
    displayName: string,
    email: string,
    password: string,
    details: PersonalDetails,
  ): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(user, { displayName });
    await this.ensureProfile(user, displayName, details);
    // The account setup page can send it again, so a failure here does not stop registration.
    await this.sendVerificationEmail().catch(() => undefined);
  }

  /** Emails the signed-in user a link that confirms their address. */
  async sendVerificationEmail(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) {
      await sendEmailVerification(user, { url: `${location.origin}/account-setup` });
    }
  }

  /**
   * Checks whether the user opened the confirmation link (in any tab or device). Refreshes the
   * ID token too, since the rules read the verified flag from it.
   */
  async checkEmailVerified(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) {
      return false;
    }
    await reload(user);
    if (user.emailVerified) {
      await user.getIdToken(true);
    }
    this.refreshUser();
    return user.emailVerified;
  }

  async signInWithGoogle(): Promise<void> {
    const { user } = await signInWithPopup(this.auth, new GoogleAuthProvider());
    await this.ensureProfile(user, user.displayName ?? '');
  }

  sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  /** Signs out here and removes this browser from the user's open sessions. */
  async signOut(): Promise<void> {
    const session = this.session;
    this.session = null;
    await session?.end().catch(() => undefined);
    await signOut(this.auth);
  }

  /** Republishes the current user after it changed in place (e.g. a password was linked). */
  refreshUser(): void {
    this._user.set(this.auth.currentUser);
  }

  /** Creates `users/{uid}` on first sign-in. New users always start as students. */
  private async ensureProfile(
    user: User,
    displayName: string,
    details?: PersonalDetails,
  ): Promise<void> {
    const [data, firestore] = await Promise.all([import('./user-data'), this.firestore.load()]);
    await data.ensureProfile(firestore, user, displayName, details);
  }

  /** The user signed this browser out from another device. */
  private async endRevokedSession(): Promise<void> {
    await this.signOut();
    await this.router.navigateByUrl('/login?ended=1');
  }

  /**
   * Subscribes to the signed-in user's profile and enrollment; resolves after the first load.
   * Loads Firestore first, so it is ready before the guards let the user into a page that uses it.
   */
  private async watchUserData(user: User | null): Promise<void> {
    const generation = ++this.generation;
    this.unsubscribeData.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeData = [];
    this.session?.stop();
    this.session = null;
    this._sessionId.set(null);
    this._profile.set(null);
    this._enrollment.set(null);
    if (!user) {
      return;
    }

    let data: typeof import('./user-data');
    let tracker: typeof import('./session-tracker');
    let firestore: Firestore;
    try {
      [data, tracker, firestore] = await Promise.all([
        import('./user-data'),
        import('./session-tracker'),
        this.firestore.load(),
      ]);
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
    this.session = tracker.trackSession(firestore, user.uid, () => this.endRevokedSession());
    this._sessionId.set(this.session.id);
    await ready;
  }
}
