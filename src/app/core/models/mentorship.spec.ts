import { audienceIds, dayDate, membersOf } from './mentorship';

describe('mentorship helpers', () => {
  const students = [
    { uid: 'ana', mentorshipIds: ['m1'] },
    { uid: 'luis', mentorshipIds: ['m1', 'm2'] },
    { uid: 'eva' },
  ];

  it("joins the students picked by name and the mentorships' students, once each", () => {
    expect(audienceIds({ studentIds: ['eva', 'ana'], mentorshipIds: ['m1'] }, students)).toEqual([
      'eva',
      'ana',
      'luis',
    ]);
    // Older evaluations and forms have no mentorships.
    expect(audienceIds({ studentIds: ['eva'] }, students)).toEqual(['eva']);
    expect(audienceIds({ studentIds: [], mentorshipIds: ['gone'] }, students)).toEqual([]);
  });

  it("lists a mentorship's students", () => {
    expect(membersOf('m1', students)).toEqual(['ana', 'luis']);
    expect(membersOf('m2', students)).toEqual(['luis']);
    expect(membersOf('m3', students)).toEqual([]);
  });

  it('reads date-only values as local days', () => {
    expect(dayDate('2026-10-01')).toEqual(new Date(2026, 9, 1));
    expect(dayDate('')).toBeNull();
    expect(dayDate(null)).toBeNull();
    expect(dayDate('1 oct')).toBeNull();
  });
});
