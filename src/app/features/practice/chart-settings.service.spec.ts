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
    saved({ indicators: ['ichimoku'] });
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
      { indicators: ['ema200', 'rsi14'], configs: {}, updatedAt: 'NOW' },
    );
    expect(service.indicators()).toEqual(['ema200', 'rsi14']);

    vi.mocked(setDoc).mockRejectedValueOnce(new Error('offline'));
    await service.saveIndicators([]);
    expect(service.indicators()).toEqual([]);
  });

  it('loads how the user set up indicators, made safe, and dropping unknown ones', async () => {
    saved({
      indicators: ['bollinger'],
      configs: {
        bollinger: { inputs: { length: 30, mult: 99 }, colors: { basis: '#ABCDEF' }, hidden: [60] },
        ichimoku: { inputs: {} },
      },
    });
    await service.load();
    expect(service.configs()).toEqual({
      bollinger: {
        // The multiplier is kept within its bounds; what is missing comes as default.
        inputs: { length: 30, mult: 20 },
        colors: { basis: '#abcdef', upper: '#2962ff', lower: '#2962ff' },
        widths: { basis: 1, upper: 1, lower: 1 },
        hidden: [60],
      },
    });
  });

  it('saves setups with the indicators on, the defaults until the user picks any', async () => {
    const config = {
      inputs: { length: 50 },
      colors: { ema: '#ff9800' },
      widths: { ema: 3 },
      hidden: [],
    };
    await service.saveConfigs({ ema100: config });
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: 'users/ana/settings/chart' },
      { indicators: ['rsi14'], configs: { ema100: config }, updatedAt: 'NOW' },
    );
    expect(service.configs()).toEqual({ ema100: config });

    // Switching indicators keeps the setups.
    await service.saveIndicators(['ema100']);
    expect(setDoc).toHaveBeenLastCalledWith(
      { path: 'users/ana/settings/chart' },
      { indicators: ['ema100'], configs: { ema100: config }, updatedAt: 'NOW' },
    );
  });
});
