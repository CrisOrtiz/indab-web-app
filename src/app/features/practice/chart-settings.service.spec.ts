import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { ChartSettingsService } from './chart-settings.service';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'NOW'),
}));

import { getDoc, setDoc } from 'firebase/firestore';

describe('ChartSettingsService', () => {
  const user = signal<{ uid: string } | null>({ uid: 'ana' });
  let service: ChartSettingsService;
  const saved = (data: unknown) =>
    vi.mocked(getDoc).mockResolvedValue({ data: () => data } as never);

  beforeEach(() => {
    vi.clearAllMocks();
    user.set({ uid: 'ana' });
    TestBed.configureTestingModule({
      providers: [
        { provide: FIRESTORE, useValue: {} },
        { provide: AuthService, useValue: { user } },
      ],
    });
    service = TestBed.inject(ChartSettingsService);
  });

  it("loads the user's indicators once per user", async () => {
    saved({ indicators: ['ema100', 'ema200'] });
    await service.load();
    expect(getDoc).toHaveBeenCalledWith({ path: 'users/ana/settings/chart' });
    expect(service.indicators()).toEqual(['ema100', 'ema200']);

    await service.load();
    expect(getDoc).toHaveBeenCalledTimes(1);

    // Another user starts from the defaults until theirs load.
    saved(undefined);
    user.set({ uid: 'bob' });
    await service.load();
    expect(getDoc).toHaveBeenCalledTimes(2);
    expect(service.indicators()).toBeNull();
  });

  it('keeps the defaults when nothing valid was saved or the read fails', async () => {
    saved({ indicators: ['macd'] });
    await service.load();
    expect(service.indicators()).toBeNull();

    user.set({ uid: 'bob' });
    vi.mocked(getDoc).mockRejectedValue(new Error('offline'));
    await service.load();
    expect(service.indicators()).toBeNull();
  });

  it('saves the indicators picked, and shows them even if the write fails', async () => {
    await service.saveIndicators(['ema200', 'rsi14']);
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'users/ana/settings/chart' },
      { indicators: ['ema200', 'rsi14'], updatedAt: 'NOW' },
    );
    expect(service.indicators()).toEqual(['ema200', 'rsi14']);

    vi.mocked(setDoc).mockRejectedValueOnce(new Error('offline'));
    await service.saveIndicators([]);
    expect(service.indicators()).toEqual([]);
  });
});
