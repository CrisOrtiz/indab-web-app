import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { AppUpdates } from './app-updates.service';

describe('AppUpdates', () => {
  const setup = (isEnabled = true) => {
    const versionUpdates = new Subject<VersionEvent>();
    const unrecoverable = new Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>();
    const sw = {
      isEnabled,
      versionUpdates,
      unrecoverable,
      checkForUpdate: vi.fn(async () => false),
    };
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: sw }] });
    const reload = vi.spyOn(AppUpdates.prototype, 'reload').mockImplementation(() => undefined);
    return { sw, reload, updates: TestBed.inject(AppUpdates) };
  };
  const version = { hash: 'abc', appData: {} };

  afterEach(() => vi.restoreAllMocks());

  it('does nothing without a service worker (dev server, tests)', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(AppUpdates).ready()).toBe(false);
  });

  it('offers a reload once a new version is downloaded', () => {
    const { sw, updates } = setup();
    sw.versionUpdates.next({ type: 'VERSION_DETECTED', version });
    expect(updates.ready()).toBe(false);
    sw.versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: version,
      latestVersion: version,
    });
    expect(updates.ready()).toBe(true);

    updates.dismiss();
    expect(updates.ready()).toBe(false);
  });

  it('reloads at once when the cached version is broken', () => {
    const { sw, reload } = setup();
    sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'missing chunk' });
    expect(reload).toHaveBeenCalled();
  });

  it('checks for a new version when the app comes back to the screen', async () => {
    const { sw } = setup();
    await TestBed.inject(ApplicationRef).whenStable();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sw.checkForUpdate).toHaveBeenCalled();
  });

  it('ignores a disabled service worker', () => {
    const { sw, updates } = setup(false);
    sw.versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: version,
      latestVersion: version,
    });
    expect(updates.ready()).toBe(false);
  });
});
