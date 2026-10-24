import { Timestamp } from 'firebase/firestore';

/** Trainers run practice evaluations and review practice; admins also manage users. */
export type UserRole = 'student' | 'trainer' | 'admin';

/**
 * Stored at `users/{uid}`. Users create their own profile and edit `displayName`, `photoURL`,
 * `birthDate` and `whatsapp`; only admins can change `role`.
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
  /**
   * `YYYY-MM-DD`, asked at registration (and once from users who signed up before, or with
   * Google, see `AuthService.setupStep`).
   */
  birthDate?: string;
  /** Optional WhatsApp number with country code, digits only: `+5215512345678`. */
  whatsapp?: string;
}

/** Details asked from every user besides their name. */
export interface PersonalDetails {
  birthDate: string;
  /** Empty when the user leaves it out. */
  whatsapp: string;
}

/**
 * Stored at `users/{uid}/sessions/{id}`: one per browser the user is signed in on, written by
 * that browser (see `session-tracker.ts`). Signing out a session from another device sets
 * `revoked`, and that browser signs itself out when it sees it.
 */
export interface DeviceSession {
  id: string;
  /** Browser and system names, e.g. `Chrome` and `Windows`; empty when unknown. */
  browser: string;
  os: string;
  mobile: boolean;
  createdAt: Timestamp;
  lastSeen: Timestamp;
  revoked: boolean;
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
