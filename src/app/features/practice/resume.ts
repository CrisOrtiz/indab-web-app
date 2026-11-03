import { PracticeSession, PracticeTrade, SessionResume } from '../../core/models/practice';

const KEY = 'indab.practice.';
const MINUTE = 60_000;

/**
 * This browser's copy of where a session was left, saved on every step, so a reload picks it up
 * at the exact bar even if the last save to Firestore did not make it.
 */
export function readLocalResume(sessionId: string): SessionResume | null {
  try {
    const raw = localStorage.getItem(KEY + sessionId);
    return raw ? (JSON.parse(raw) as SessionResume) : null;
  } catch {
    return null;
  }
}

export function writeLocalResume(sessionId: string, resume: SessionResume): void {
  try {
    localStorage.setItem(KEY + sessionId, JSON.stringify(resume));
  } catch {
    // Private mode or a full storage: Firestore still has a copy a few seconds old.
  }
}

export function clearLocalResume(sessionId: string): void {
  try {
    localStorage.removeItem(KEY + sessionId);
  } catch {
    // Nothing to clear.
  }
}

/** The copy that got further: this browser's, unless another device went on from there. */
export function pickResume(
  saved: SessionResume | undefined,
  local: SessionResume | null,
): SessionResume | null {
  if (!local || !saved) {
    return local ?? saved ?? null;
  }
  return saved.time > local.time ? saved : local;
}

/**
 * Where to pick the replay up (seconds): the saved position, or later if a trade was placed,
 * filled or closed after it was saved. Without either, the replay start.
 */
export function resumeTime(
  replayStart: number,
  resume: SessionResume | null,
  trades: PracticeTrade[],
): number {
  const times = trades.flatMap((t) => [t.placedTime, t.entryTime, t.exitTime ?? 0]);
  return Math.max(replayStart / 1000 - 60, resume?.time ?? 0, ...times);
}

/**
 * Whether an evaluation attempt can no longer be picked up: its time and the two minutes the
 * rules allow to close it are over, so nothing about it can be saved any more.
 */
export function attemptExpired(session: PracticeSession, now: number): boolean {
  if (session.durationMinutes == null) {
    return false;
  }
  const started = session.startedAt?.toMillis() ?? 0;
  return now >= started + (session.durationMinutes + (session.extraMinutes ?? 0) + 2) * MINUTE;
}

/** When an evaluation attempt's time runs out (ms), or null for free practice. */
export function attemptDeadline(session: PracticeSession): number | null {
  if (session.durationMinutes == null) {
    return null;
  }
  return (
    (session.startedAt?.toMillis() ?? 0) +
    (session.durationMinutes + (session.extraMinutes ?? 0)) * MINUTE
  );
}

/**
 * Whether an evaluation attempt's time is up. One the student left open counts as finished from
 * then on (they close it, or it is closed for them, the next time they open the practice page).
 */
export function attemptTimeUp(session: PracticeSession, now: number): boolean {
  const deadline = attemptDeadline(session);
  return deadline !== null && now >= deadline;
}

/** A session's status as students and staff should see it: time-up attempts are finished. */
export function shownStatus(session: PracticeSession, now: number): PracticeSession['status'] {
  return session.status === 'active' && attemptTimeUp(session, now) ? 'finished' : session.status;
}

/**
 * Of a student's active sessions (newest first), the ones to close: evaluation attempts whose
 * time is up, and every free practice but the newest. Only the last free practice stays open
 * (Cris, 2026-11-03); evaluations stay open until their time runs out.
 */
export function staleSessions(sessions: PracticeSession[], now: number): PracticeSession[] {
  const newestFree = sessions.find((s) => s.durationMinutes == null);
  return sessions.filter((s) =>
    s.durationMinutes == null ? s !== newestFree : attemptTimeUp(s, now),
  );
}
