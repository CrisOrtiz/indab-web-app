import { PracticeSession, PracticeTrade, SessionResume } from '../../core/models/practice';
import {
  attemptExpired,
  clearLocalResume,
  pickResume,
  readLocalResume,
  resumeTime,
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
});
