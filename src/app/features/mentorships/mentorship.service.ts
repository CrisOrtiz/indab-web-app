import { Injectable, inject } from '@angular/core';
import {
  arrayRemove,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { LoadingService } from '../../core/loading/loading.service';
import { Mentorship } from '../../core/models/mentorship';

/** What an admin fills in to set up a mentorship. */
export type MentorshipInput = Pick<
  Mentorship,
  'name' | 'description' | 'mentorIds' | 'startDate' | 'endDate' | 'active'
>;

/**
 * Mentorships (`mentorships/{id}`): admins create, edit and delete them; trainers read them to
 * assign forms and evaluations to a whole group (see `firestore.rules`). Students join them
 * from `/admin/users` (`AdminService.setMentorships`).
 */
@Injectable({ providedIn: 'root' })
export class MentorshipService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly loading = inject(LoadingService);

  private readonly mentorships = collection(this.firestore, 'mentorships');

  /** Every mentorship (staff), active ones first, then by name. */
  async all(): Promise<Mentorship[]> {
    const snapshot = await this.loading.track(getDocs(this.mentorships));
    return sortMentorships(snapshot.docs.map((d) => ({ ...(d.data() as Mentorship), id: d.id })));
  }

  async create(input: MentorshipInput): Promise<string> {
    const ref = doc(this.mentorships);
    await setDoc(ref, {
      ...input,
      createdBy: this.auth.user()?.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  update(id: string, input: Partial<MentorshipInput>): Promise<void> {
    return updateDoc(doc(this.mentorships, id), { ...input, updatedAt: serverTimestamp() });
  }

  /**
   * Deletes the mentorship and takes it off its students. Forms and evaluations that were
   * assigned to it keep the id, which then matches nobody.
   */
  async remove(id: string): Promise<void> {
    const members = await getDocs(
      query(collection(this.firestore, 'users'), where('mentorshipIds', 'array-contains', id)),
    );
    const batch = writeBatch(this.firestore);
    for (const member of members.docs) {
      batch.update(member.ref, { mentorshipIds: arrayRemove(id) });
    }
    batch.delete(doc(this.mentorships, id));
    await batch.commit();
  }
}

/** Active mentorships first, then by name (Spanish collation). */
export function sortMentorships(list: Mentorship[]): Mentorship[] {
  return [...list].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
  );
}
