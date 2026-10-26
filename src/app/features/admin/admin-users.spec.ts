import { AdminUserRow, filterUsers, sortUsers } from './admin-users';
import { Enrollment, UserProfile } from '../../core/models/user-profile';

const row = (
  uid: string,
  displayName: string,
  role: UserProfile['role'] = 'student',
  academy?: boolean,
): AdminUserRow => ({
  profile: { uid, displayName, email: `${uid}@indab.co`, role } as UserProfile,
  enrollment: academy === undefined ? null : ({ academy, courses: [] } as unknown as Enrollment),
});

describe('admin users', () => {
  const rows = [
    row('jose', 'José Pérez', 'student', true),
    row('ana', 'Ana Gómez', 'admin'),
    row('luis', 'Luis Díaz', 'student', false),
  ];
  rows[0].profile.mentorshipIds = ['m1', 'm2'];
  const all = { search: '', role: 'all', access: 'all', mentorship: '' } as const;
  const uids = (result: AdminUserRow[]) => result.map((r) => r.profile.uid);

  it('searches name, email and uid ignoring case and accents', () => {
    expect(uids(filterUsers(rows, { ...all, search: 'JOSE' }))).toEqual(['jose']);
    expect(uids(filterUsers(rows, { ...all, search: 'luis@indab' }))).toEqual(['luis']);
    expect(uids(filterUsers(rows, { ...all, search: 'ana gomez' }))).toEqual(['ana']);
    expect(filterUsers(rows, { ...all, search: 'nadie' })).toEqual([]);
  });

  it('filters by role and academy access', () => {
    expect(uids(filterUsers(rows, { ...all, role: 'admin' }))).toEqual(['ana']);
    expect(uids(filterUsers(rows, { ...all, access: 'granted' }))).toEqual(['jose']);
    expect(uids(filterUsers(rows, { ...all, access: 'pending' }))).toEqual(['ana', 'luis']);
  });

  it('filters by mentorship, or students in none', () => {
    expect(uids(filterUsers(rows, { ...all, mentorship: 'm2' }))).toEqual(['jose']);
    expect(uids(filterUsers(rows, { ...all, mentorship: 'm3' }))).toEqual([]);
    // Only students can be in a mentorship, so "none" lists students only.
    expect(uids(filterUsers(rows, { ...all, mentorship: 'none' }))).toEqual(['luis']);
  });

  it('sorts by name', () => {
    expect(uids(sortUsers(rows))).toEqual(['ana', 'jose', 'luis']);
  });
});
