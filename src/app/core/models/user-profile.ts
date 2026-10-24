import { Timestamp } from 'firebase/firestore';

/** Trainers run practice evaluations and review practice; admins also manage users. */
export type UserRole = 'student' | 'trainer' | 'admin';

/**
 * Stored at `users/{uid}`. Users create their own profile and edit `displayName` and
 * `photoURL`; only admins can change `role`.
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Timestamp;
  /**
   * Photo uploaded from `/profile`: a small square JPEG as a `data:` URL (see `resizeImage`).
   * Missing when the user has not uploaded one; the header then uses the Google photo.
   */
  photoURL?: string;
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
