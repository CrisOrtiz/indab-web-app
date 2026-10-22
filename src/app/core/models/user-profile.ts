import { Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'admin';

/** Stored at `users/{uid}`. Users create their own profile; only admins can change `role`. */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Timestamp;
}

/**
 * Stored at `enrollments/{uid}` and written only by admins (from `/admin` or the console).
 * `academy` unlocks the academy area and the learning-material repository;
 * `courses` lists the individual courses the user can open.
 */
export interface Enrollment {
  academy: boolean;
  courses: string[];
  updatedAt: Timestamp;
  /** uid of the admin who last changed it. */
  updatedBy?: string;
}
