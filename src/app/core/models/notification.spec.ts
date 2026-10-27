import { DEFAULT_SETTINGS, followedSubjects, notificationLink } from './notification';

describe('notification helpers', () => {
  it('lists each followed subject as kind/id', () => {
    expect(followedSubjects(DEFAULT_SETTINGS)).toEqual([]);
    expect(
      followedSubjects({
        ...DEFAULT_SETTINGS,
        all: true,
        studentIds: ['ana'],
        mentorshipIds: ['m1'],
        evaluationIds: ['e1'],
        examIds: ['x1'],
      }),
    ).toEqual(['all/all', 'student/ana', 'mentorship/m1', 'evaluation/e1', 'exam/x1']);
  });

  it('links each notification to what it is about', () => {
    const link = (type: string, kind: string, refId: string, contextId: string | null) =>
      notificationLink({ type, kind, refId, contextId } as Parameters<typeof notificationLink>[0]);
    expect(link('note', 'practice', 's1', null)).toEqual({ path: '/academy/practice/sessions/s1' });
    expect(link('note', 'evaluation', 'e1_ana', 'e1')).toEqual({
      path: '/academy/practice/sessions/e1_ana',
    });
    expect(link('note', 'exam', 'x1_ana_1', 'x1')).toEqual({ path: '/academy/exams/x1' });
    expect(link('assigned', 'evaluation', 'e1', 'e1')).toEqual({ path: '/academy/practice' });
    expect(link('assigned', 'exam', 'x1', 'x1')).toEqual({ path: '/academy/exams/x1' });
    expect(link('results', 'evaluation', 'e1', 'e1')).toEqual({ path: '/academy/ranking' });
    expect(link('results', 'exam', 'x1', 'x1')).toEqual({ path: '/academy/exams/x1' });
    expect(link('practiceFinished', 'practice', 's1', null)).toEqual({
      path: '/academy/practice/sessions/s1',
    });
    expect(link('examSubmitted', 'exam', 'x1_ana_1', 'x1')).toEqual({
      path: '/admin/forms/x1',
      query: { submission: 'x1_ana_1' },
    });
  });
});
