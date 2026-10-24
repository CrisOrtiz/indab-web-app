import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { LoadingService } from '../../core/loading/loading.service';
import { Evaluation } from '../../core/models/evaluation';
import { Enrollment, UserProfile } from '../../core/models/user-profile';

/** What a trainer fills in to set up an evaluation. */
export type EvaluationInput = Omit<
  Evaluation,
  'id' | 'opensAt' | 'closesAt' | 'createdBy' | 'createdAt' | 'updatedAt'
> & { opensAt: Date; closesAt: Date };

/** A student who can be assigned to an evaluation. */
export interface StudentOption {
  uid: string;
  name: string;
  email: string;
  academy: boolean;
}

/**
 * Practice evaluations (`evaluations/{id}`): trainers and admins set them up and assign
 * students; students read the ones assigned to them (see `firestore.rules`).
 */
@Injectable({ providedIn: 'root' })
export class EvaluationService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly loading = inject(LoadingService);

  private readonly evaluations = collection(this.firestore, 'evaluations');

  /** Every evaluation, newest window first (trainers and admins). */
  async all(): Promise<Evaluation[]> {
    return sortByWindow(this.read(await this.loading.track(getDocs(this.evaluations))));
  }

  /** The evaluations assigned to a student, newest window first. */
  async assignedTo(uid: string): Promise<Evaluation[]> {
    const snapshot = await this.loading.track(
      getDocs(query(this.evaluations, where('studentIds', 'array-contains', uid))),
    );
    return sortByWindow(this.read(snapshot));
  }

  async create(input: EvaluationInput): Promise<string> {
    const ref = doc(this.evaluations);
    await setDoc(ref, {
      ...input,
      createdBy: this.auth.user()?.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  update(id: string, input: EvaluationInput): Promise<void> {
    return updateDoc(doc(this.evaluations, id), { ...input, updatedAt: serverTimestamp() });
  }

  setResultsPublished(id: string, resultsPublished: boolean): Promise<void> {
    return updateDoc(doc(this.evaluations, id), { resultsPublished, updatedAt: serverTimestamp() });
  }

  /** Deletes the evaluation; its attempts stay in the practice review. */
  remove(id: string): Promise<void> {
    return deleteDoc(doc(this.evaluations, id));
  }

  /** Students that can be assigned, by name, with their academy access. */
  async students(): Promise<StudentOption[]> {
    const [users, enrollments] = await this.loading.track(
      Promise.all([
        getDocs(collection(this.firestore, 'users')),
        getDocs(collection(this.firestore, 'enrollments')),
      ]),
    );
    const access = new Map(
      enrollments.docs.map((d) => [d.id, (d.data() as Enrollment).academy === true]),
    );
    return users.docs
      .map((d) => ({ ...(d.data() as UserProfile), uid: d.id }))
      .filter((profile) => profile.role === 'student')
      .map((profile) => ({
        uid: profile.uid,
        name: profile.displayName || profile.email || profile.uid,
        email: profile.email ?? '',
        academy: access.get(profile.uid) ?? false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }

  private read(snapshot: { docs: { id: string; data: () => unknown }[] }): Evaluation[] {
    return snapshot.docs.map((d) => ({ ...(d.data() as Evaluation), id: d.id }));
  }
}

const sortByWindow = (list: Evaluation[]): Evaluation[] =>
  [...list].sort((a, b) => (b.opensAt?.toMillis() ?? 0) - (a.opensAt?.toMillis() ?? 0));
