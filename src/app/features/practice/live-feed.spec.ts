import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FUTURES_STREAM_URL, LiveFeed, parseKlineEvent } from './live-feed';

// Wednesday 11 November 2026, 15:30 UTC: gold is open.
const OPEN = Date.UTC(2026, 10, 11, 15, 30);
// Saturday 14 November 2026, 12:00 UTC: gold is closed.
const SATURDAY = Date.UTC(2026, 10, 14, 12);

const event = (patch: Record<string, unknown> = {}) => ({
  e: 'kline',
  E: OPEN + 1500,
  s: 'XAUUSDT',
  k: {
    t: OPEN,
    T: OPEN + 59_999,
    s: 'XAUUSDT',
    i: '1m',
    o: '4100.10',
    h: '4102.50',
    l: '4099.00',
    c: '4101.20',
    v: '12.5',
    n: 40,
    x: false,
    ...patch,
  },
});

describe('parseKlineEvent', () => {
  it('turns a kline event into the minute it belongs to', () => {
    expect(parseKlineEvent('XAUUSDT', event())).toEqual({
      time: OPEN / 1000,
      open: 4100.1,
      high: 4102.5,
      low: 4099,
      close: 4101.2,
      volume: 12.5,
    });
  });

  it('drops gold minutes while the market is closed or nothing traded yet', () => {
    expect(parseKlineEvent('XAUUSDT', event({ t: SATURDAY }))).toBeNull();
    expect(parseKlineEvent('XAUUSDT', event({ n: 0 }))).toBeNull();
  });

  it('ignores other messages and broken prices', () => {
    expect(parseKlineEvent('XAUUSDT', { result: null, id: 1 })).toBeNull();
    expect(parseKlineEvent('XAUUSDT', event({ i: '5m' }))).toBeNull();
    expect(parseKlineEvent('XAUUSDT', event({ c: 'x' }))).toBeNull();
    expect(parseKlineEvent('XAUUSDT', null)).toBeNull();
  });
});

/** A stand-in for the browser's WebSocket that the test drives. */
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

describe('LiveFeed', () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const connect = () => {
    const handlers = { candle: vi.fn(), opened: vi.fn(), status: vi.fn() };
    const connection = TestBed.inject(LiveFeed).connect('XAUUSDT', handlers);
    return { handlers, connection };
  };

  it("listens to the symbol's one-minute klines on Binance's market stream", () => {
    const { handlers } = connect();
    const socket = FakeSocket.all[0];
    expect(socket.url).toBe(`${FUTURES_STREAM_URL}xauusdt@kline_1m`);
    expect(FUTURES_STREAM_URL).toBe('wss://fstream.binance.com/market/ws/');
    expect(handlers.status).toHaveBeenLastCalledWith('connecting');
    socket.onopen!();
    expect(handlers.status).toHaveBeenLastCalledWith('live');
    expect(handlers.opened).toHaveBeenCalledTimes(1);
    socket.onmessage!({ data: JSON.stringify(event()) });
    socket.onmessage!({ data: 'not json' });
    expect(handlers.candle).toHaveBeenCalledTimes(1);
    expect(handlers.candle.mock.calls[0][0].close).toBe(4101.2);
  });

  it('reconnects after a drop, and before Binance cuts it at 24 hours', () => {
    const { handlers, connection } = connect();
    FakeSocket.all[0].onopen!();
    FakeSocket.all[0].onclose!();
    expect(handlers.status).toHaveBeenLastCalledWith('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1].onopen!();
    expect(handlers.opened).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(23 * 60 * 60_000);
    expect(FakeSocket.all[1].closed).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(3);

    connection.close();
    expect(FakeSocket.all[2].closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(3);
  });
});
