import { vi } from 'vitest';

const fb = vi.hoisted(() => ({
  existing: new Map<string, Record<string, unknown>>(),
  listener: null as ((snapshot: unknown) => void) | null,
  unsubscribe: vi.fn(),
  nextId: 'auto-id',
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ path: segments.join('/') })),
  doc: vi.fn((parent: { path: string }, id?: string) => ({
    path: `${parent.path}/${id ?? fb.nextId}`,
    id: id ?? fb.nextId,
  })),
  getDoc: vi.fn(async (ref: { path: string }) => ({
    exists: () => fb.existing.has(ref.path),
    data: () => fb.existing.get(ref.path),
  })),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  onSnapshot: vi.fn((_ref, next) => {
    fb.listener = next;
    return fb.unsubscribe;
  }),
}));

import * as firestore from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { REFRESH_MS, describeDevice, trackSession } from './session-tracker';

const db = {} as Firestore;
const flush = () => new Promise((resolve) => setTimeout(resolve));
const revokedSnapshot = { data: () => ({ revoked: true }) };

describe('describeDevice', () => {
  it('names common browsers and systems', () => {
    const windowsChrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
    expect(describeDevice(windowsChrome)).toEqual({
      browser: 'Chrome',
      os: 'Windows',
      mobile: false,
    });
    expect(describeDevice(`${windowsChrome} Edg/130.0`).browser).toBe('Edge');
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', os: 'iOS', mobile: true });
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      ),
    ).toEqual({ browser: 'Chrome', os: 'Android', mobile: true });
    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0',
      ),
    ).toEqual({ browser: 'Firefox', os: 'macOS', mobile: false });
    expect(describeDevice('curl/8.0')).toEqual({ browser: '', os: '', mobile: false });
  });
});

describe('trackSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fb.existing.clear();
    fb.listener = null;
    localStorage.clear();
  });

  it('records a new browser once and reuses its id after a reload', async () => {
    const onRevoked = vi.fn();
    const first = trackSession(db, 'ana', onRevoked);
    await flush();
    expect(first.id).toBe('auto-id');
    expect(localStorage.getItem('indab.session.ana')).toBe('auto-id');
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: 'users/ana/sessions/auto-id', id: 'auto-id' },
      expect.objectContaining({
        createdAt: 'SERVER_TIMESTAMP',
        lastSeen: 'SERVER_TIMESTAMP',
        revoked: false,
        mobile: expect.any(Boolean),
      }),
    );
    first.stop();

    fb.existing.set('users/ana/sessions/auto-id', { revoked: false });
    fb.nextId = 'other-id';
    const again = trackSession(db, 'ana', onRevoked);
    await flush();
    expect(again.id).toBe('auto-id');
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      { path: 'users/ana/sessions/auto-id', id: 'auto-id' },
      { lastSeen: 'SERVER_TIMESTAMP' },
    );
    expect(onRevoked).not.toHaveBeenCalled();
    again.stop();
    fb.nextId = 'auto-id';
  });

  it('calls onRevoked once when another device signs this one out', async () => {
    const onRevoked = vi.fn();
    const session = trackSession(db, 'ana', onRevoked);
    await flush();
    fb.listener!({ data: () => ({ revoked: false }) });
    expect(onRevoked).not.toHaveBeenCalled();
    fb.listener!(revokedSnapshot);
    fb.listener!(revokedSnapshot);
    expect(onRevoked).toHaveBeenCalledOnce();
    session.stop();
  });

  it('signs out at start when this browser was signed out while closed', async () => {
    localStorage.setItem('indab.session.ana', 'old');
    fb.existing.set('users/ana/sessions/old', { revoked: true });
    const onRevoked = vi.fn();
    trackSession(db, 'ana', onRevoked);
    await flush();
    expect(onRevoked).toHaveBeenCalledOnce();
    expect(firestore.updateDoc).not.toHaveBeenCalled();
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
  });

  it('refreshes lastSeen when the tab comes back after a while', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const session = trackSession(db, 'ana', vi.fn());
    await flush();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(firestore.updateDoc).not.toHaveBeenCalled();

    now.mockReturnValue(1_000_000 + REFRESH_MS + 1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(firestore.updateDoc).toHaveBeenCalledOnce();
    session.stop();
    now.mockRestore();
  });

  it('removes the entry and its id on sign-out', async () => {
    const session = trackSession(db, 'ana', vi.fn());
    await flush();
    await session.end();
    expect(fb.unsubscribe).toHaveBeenCalled();
    expect(firestore.deleteDoc).toHaveBeenCalledWith({
      path: 'users/ana/sessions/auto-id',
      id: 'auto-id',
    });
    expect(localStorage.getItem('indab.session.ana')).toBeNull();
  });

  it('ignores a failed write', async () => {
    vi.mocked(firestore.setDoc).mockRejectedValueOnce(new Error('offline'));
    const session = trackSession(db, 'ana', vi.fn());
    await flush();
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
    session.stop();
  });
});
