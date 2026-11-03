import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { Material, byNewest } from '../../core/models/material';

/** What staff fill in to add a piece of material. */
export type MaterialInput = Omit<Material, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>;

/**
 * Study material (`materials/{id}`): staff add and edit it at `/admin/material`; students read
 * the published material meant for everyone or assigned to them (see `firestore.rules`).
 */
@Injectable({ providedIn: 'root' })
export class MaterialService {
  private readonly firestore = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly loading = inject(LoadingService);

  private readonly materials = collection(this.firestore, 'materials');

  /** Every piece of material, drafts included (staff), newest first. */
  async all(): Promise<Material[]> {
    const snapshot = await this.loading.track(getDocs(this.materials));
    return snapshot.docs.map((d) => ({ ...(d.data() as Material), id: d.id })).sort(byNewest);
  }

  /** One piece of material, or null when it does not exist or is not for this user. */
  async get(id: string): Promise<Material | null> {
    try {
      const snapshot = await this.loading.track(getDoc(doc(this.materials, id)));
      return snapshot.exists() ? { ...(snapshot.data() as Material), id: snapshot.id } : null;
    } catch {
      return null;
    }
  }

  /**
   * What a student can open: published material for everyone plus the material assigned to
   * them by name or through one of their mentorships. Staff see every published piece.
   */
  async visible(): Promise<Material[]> {
    if (this.auth.isStaff()) {
      return (await this.all()).filter((m) => m.published);
    }
    const uid = this.auth.user()?.uid ?? '';
    const published = where('published', '==', true);
    // `array-contains-any` takes at most 30 values (a student has at most 20 mentorships).
    const groups = (this.auth.profile()?.mentorshipIds ?? []).slice(0, 30);
    const snapshots = await this.loading.track(
      Promise.all([
        getDocs(query(this.materials, published, where('audience', '==', 'all'))),
        getDocs(query(this.materials, published, where('studentIds', 'array-contains', uid))),
        ...(groups.length
          ? [
              getDocs(
                query(
                  this.materials,
                  published,
                  where('mentorshipIds', 'array-contains-any', groups),
                ),
              ),
            ]
          : []),
      ]),
    );
    const byId = new Map<string, Material>();
    for (const d of snapshots.flatMap((s) => s.docs)) {
      byId.set(d.id, { ...(d.data() as Material), id: d.id });
    }
    return [...byId.values()].sort(byNewest);
  }

  async create(input: MaterialInput): Promise<string> {
    const ref = doc(this.materials);
    await setDoc(ref, {
      ...input,
      createdBy: this.auth.user()?.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  update(id: string, input: Partial<MaterialInput>): Promise<void> {
    return updateDoc(doc(this.materials, id), { ...input, updatedAt: serverTimestamp() });
  }

  remove(id: string): Promise<void> {
    return deleteDoc(doc(this.materials, id));
  }
}
