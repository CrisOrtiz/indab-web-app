import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { I18n } from '../../core/i18n/i18n.service';
import { Enrollment, UserProfile, UserRole } from '../../core/models/user-profile';
import { AdminUserRow, sortUsers } from './admin-users';

/**
 * Live list of every user and enrollment, for the admin area. Provided by the `Admin`
 * component (not in root) so the listeners stop when the admin leaves the page.
 * Firestore rules only let admins write the changes below; it listens for admins only.
 */
@Injectable()
export class AdminService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18n);

  private readonly _users = signal<UserProfile[]>([]);
  private readonly _enrollments = signal<ReadonlyMap<string, Enrollment>>(new Map());
  private readonly _loading = signal(true);
  private readonly _error = signal<string | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly users = computed<AdminUserRow[]>(() => {
    const enrollments = this._enrollments();
    return sortUsers(
      this._users().map((profile) => ({
        profile,
        enrollment: enrollments.get(profile.uid) ?? null,
      })),
    );
  });

  constructor() {
    // Trainers open the admin area too, but only admins manage users.
    if (!this.auth.isAdmin()) {
      this._loading.set(false);
      return;
    }
    const onError = () => {
      this._error.set(this.i18n.messages().admin.loadFailed);
      this._loading.set(false);
    };
    const stopUsers = onSnapshot(
      collection(this.firestore, 'users'),
      (snapshot) => {
        this._users.set(snapshot.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id })));
        this._loading.set(false);
      },
      onError,
    );
    const stopEnrollments = onSnapshot(
      collection(this.firestore, 'enrollments'),
      (snapshot) =>
        this._enrollments.set(new Map(snapshot.docs.map((d) => [d.id, d.data() as Enrollment]))),
      onError,
    );
    inject(DestroyRef).onDestroy(() => {
      stopUsers();
      stopEnrollments();
    });
  }

  setRole(uid: string, role: UserRole): Promise<void> {
    return updateDoc(doc(this.firestore, 'users', uid), { role });
  }

  /** Grants or revokes academy access, keeping any per-course enrollments. */
  setAcademyAccess(uid: string, academy: boolean): Promise<void> {
    const current = this._enrollments().get(uid);
    return setDoc(doc(this.firestore, 'enrollments', uid), {
      academy,
      courses: current?.courses ?? [],
      updatedAt: serverTimestamp(),
      updatedBy: this.auth.user()?.uid,
    });
  }
}
