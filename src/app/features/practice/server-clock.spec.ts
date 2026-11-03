import { TestBed } from '@angular/core/testing';
import { ServerClock } from './server-clock';

describe('ServerClock', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows the server's clock once synced", async () => {
    const device = Date.now();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ serverTime: device + 120_000 }))),
    );
    const clock = TestBed.inject(ServerClock);
    await clock.sync();
    expect(Math.abs(clock.now() - (Date.now() + 120_000))).toBeLessThan(1_000);
  });

  it("keeps the device's clock when the server cannot be reached", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const clock = TestBed.inject(ServerClock);
    await clock.sync();
    expect(Math.abs(clock.now() - Date.now())).toBeLessThan(50);
  });
});
