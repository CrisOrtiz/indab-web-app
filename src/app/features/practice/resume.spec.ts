import { PracticeSession, PracticeTrade, SessionResume } from '../../core/models/practice';
import {
  attemptDeadline,
  attemptExpired,
  attemptTimeUp,
  clearLocalResume,
  pickResume,
  readLocalResume,
  resumeTime,
  shownStatus,
  staleSessions,
  writeLocalResume,
} from './resume';

const resume = (time: number): SessionResume => ({
  time,
  interval: '15m',
  hideDates: true,
  speed: 2,
  drawings: [],
});

describe('resuming a practice session', () => {
  beforeEach(() => localStorage.clear());

  it("keeps this browser's copy until the session ends", () => {
    expect(readLocalResume('s1')).toBeNull();
    writeLocalResume('s1', resume(600));
    expect(readLocalResume('s1')).toEqual(resume(600));
    clearLocalResume('s1');
    expect(readLocalResume('s1')).toBeNull();
    localStorage.setItem('indab.practice.s2', '{broken');
    expect(readLocalResume('s2')).toBeNull();
  });

  it('takes the copy that got further', () => {
    expect(pickResume(undefined, null)).toBeNull();
    expect(pickResume(resume(60), null)).toEqual(resume(60));
    expect(pickResume(undefined, resume(60))).toEqual(resume(60));
    expect(pickResume(resume(60), resume(120))?.time).toBe(120);
    expect(pickResume(resume(180), resume(120))?.time).toBe(180);
  });

  it('goes on after the last trade when it is later than the saved bar', () => {
    const trade = { placedTime: 300, entryTime: 360, exitTime: 900 } as PracticeTrade;
    expect(resumeTime(60_000, null, [])).toBe(0);
    expect(resumeTime(60_000, resume(600), [])).toBe(600);
    expect(resumeTime(60_000, resume(600), [trade])).toBe(900);
    expect(resumeTime(60_000, resume(1200), [trade])).toBe(1200);
  });

  it('gives up on an evaluation attempt two minutes after its time', () => {
    const now = Date.now();
    const attempt = (startedMinutesAgo: number, durationMinutes?: number) =>
      ({
        durationMinutes,
        startedAt: { toMillis: () => now - startedMinutesAgo * 60_000 },
      }) as PracticeSession;
    expect(attemptExpired(attempt(500), now)).toBe(false);
    expect(attemptExpired(attempt(31, 30), now)).toBe(false);
    expect(attemptExpired(attempt(32, 30), now)).toBe(true);
  });

  it('counts an attempt left open past its time as finished', () => {
    const now = Date.now();
    const session = (startedMinutesAgo: number, durationMinutes?: number) =>
      ({
        status: 'active',
        durationMinutes,
        startedAt: { toMillis: () => now - startedMinutesAgo * 60_000 },
      }) as PracticeSession;
    expect(attemptDeadline(session(10, 30))).toBe(now + 20 * 60_000);
    expect(attemptDeadline(session(10))).toBeNull();
    expect(attemptTimeUp(session(29, 30), now)).toBe(false);
    expect(attemptTimeUp(session(30, 30), now)).toBe(true);
    // Free practice stays open until the student closes it.
    expect(shownStatus(session(5000), now)).toBe('active');
    expect(shownStatus(session(29, 30), now)).toBe('active');
    expect(shownStatus(session(31, 30), now)).toBe('finished');
  });

  it('keeps the last free practice and attempts with time left open', () => {
    const now = Date.now();
    const session = (id: string, startedMinutesAgo: number, durationMinutes?: number) =>
      ({
        id,
        status: 'active',
        durationMinutes,
        startedAt: { toMillis: () => now - startedMinutesAgo * 60_000 },
      }) as PracticeSession;
    // Newest first, as Firestore lists them.
    const sessions = [
      session('ev2', 5, 30),
      session('free3', 10),
      session('ev1', 40, 30),
      session('free2', 60),
      session('free1', 600),
    ];
    expect(staleSessions(sessions, now).map((s) => s.id)).toEqual(['ev1', 'free2', 'free1']);
    expect(staleSessions([], now)).toEqual([]);
  });
});
