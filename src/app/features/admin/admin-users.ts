import { Enrollment, UserProfile } from '../../core/models/user-profile';

/** A user as shown in the admin area: their profile joined with their enrollment, if any. */
export interface AdminUserRow {
  profile: UserProfile;
  enrollment: Enrollment | null;
}

export interface AdminUserFilter {
  /** Free text matched against name, email and uid. */
  search: string;
  role: 'all' | 'student' | 'admin';
  access: 'all' | 'granted' | 'pending';
}

export const hasAcademyAccess = (row: AdminUserRow): boolean => row.enrollment?.academy === true;

/** Lowercases and strips accents so "jose" matches "José". */
const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function filterUsers(rows: AdminUserRow[], filter: AdminUserFilter): AdminUserRow[] {
  const terms = normalize(filter.search).split(/\s+/).filter(Boolean);
  return rows.filter(({ profile, enrollment }) => {
    if (filter.role !== 'all' && profile.role !== filter.role) {
      return false;
    }
    const granted = enrollment?.academy === true;
    if ((filter.access === 'granted' && !granted) || (filter.access === 'pending' && granted)) {
      return false;
    }
    const haystack = normalize(
      `${profile.displayName ?? ''} ${profile.email ?? ''} ${profile.uid}`,
    );
    return terms.every((term) => haystack.includes(term));
  });
}

/** Sorts by name (falling back to email), using Spanish collation. */
export function sortUsers(rows: AdminUserRow[]): AdminUserRow[] {
  const label = (row: AdminUserRow) => row.profile.displayName || row.profile.email || '';
  return [...rows].sort((a, b) => label(a).localeCompare(label(b), 'es', { sensitivity: 'base' }));
}
