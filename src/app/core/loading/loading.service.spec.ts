import { TestBed } from '@angular/core/testing';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  const service = () => TestBed.inject(LoadingService);

  it('is busy until every task has ended', () => {
    const loading = service();
    const endA = loading.begin();
    const endB = loading.begin();
    expect(loading.busy()).toBe(true);
    endA();
    endA();
    expect(loading.busy()).toBe(true);
    endB();
    expect(loading.busy()).toBe(false);
  });

  it('tracks a promise and passes its result through', async () => {
    const loading = service();
    let resolve!: (value: number) => void;
    const result = loading.track(new Promise<number>((r) => (resolve = r)));
    expect(loading.busy()).toBe(true);
    resolve(42);
    expect(await result).toBe(42);
    expect(loading.busy()).toBe(false);
  });

  it('stops tracking a promise that fails', async () => {
    const loading = service();
    await expect(loading.track(Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(loading.busy()).toBe(false);
  });
});
