import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Candle, PracticeTrade } from '../../core/models/practice';
import { EvaluationService } from '../evaluations/evaluation.service';
import { quietNotifications } from '../notifications/testing';
import { LiveFeed, LiveFeedHandlers } from './live-feed';
import { MarketDataService } from './market-data.service';
import { Practice, chartAnchor } from './practice';
import { PracticeService } from './practice.service';
import { ReplayChart } from './replay-chart';
import { ServerClock } from './server-clock';
import { FakeChart, quietChartSettings } from './testing';

const MINUTE = 60_000;
// Wednesday 11 November 2026, 15:30:20 UTC: gold is open.
const NOW = Date.UTC(2026, 10, 11, 15, 30, 20);
// Saturday 14 November 2026, 12:00 UTC: gold is closed.
const SATURDAY = Date.UTC(2026, 10, 14, 12);

const flat = (time: number, price: number): Candle => ({
  time,
  open: price,
  high: price,
  low: price,
  close: price,
});
/** One-minute candles at `price` from `from` (ms) up to the minute of `NOW`, forming one included. */
const minutesSince = (from: number, price = 4000): Candle[] => {
  const count = Math.floor((NOW - from) / MINUTE) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => flat(from / 1000 + i * 60, price));
};

describe('Practice page, live trading', () => {
  const quiet = quietNotifications();
  let fixture: ComponentFixture<Practice>;
  let el: HTMLElement;
  let now = NOW;
  let feed: LiveFeedHandlers | null = null;
  const closeFeed = vi.fn();
  const liveFeed = {
    connect: vi.fn((_symbol: string, handlers: LiveFeedHandlers) => {
      feed = handlers;
      return { close: closeFeed };
    }),
  };
  const market = {
    loadCandles: vi.fn(),
    loadHistory: vi.fn(async (_s: string, _i: string, end: number, limit: number) =>
      Array.from({ length: limit }, (_, i) => flat(end / 1000 - (limit - i) * 900, 3990)),
    ),
    loadMinutesSince: vi.fn(async (_s: string, from: number) => minutesSince(from)),
    catchUpMinutes: vi.fn(async (_s: string, _from: number) => [] as Candle[]),
  };
  const practice = {
    startSession: vi.fn(async (..._args: unknown[]) => 'live-1'),
    newTradeId: vi.fn(() => 't1'),
    openTrade: vi.fn(async () => undefined),
    fillOrder: vi.fn(async (..._args: unknown[]) => undefined),
    cancelOrder: vi.fn(async () => undefined),
    updateLevels: vi.fn(async () => undefined),
    closeTrade: vi.fn(async (..._args: unknown[]) => undefined),
    updateSummary: vi.fn(async () => undefined),
    finishSession: vi.fn(async () => undefined),
    sessionsPage: vi.fn(async () => ({ items: [], last: null, hasMore: false })),
    myAttempts: vi.fn(async () => []),
    sessionTrades: vi.fn(async () => [] as PracticeTrade[]),
    activeSessions: vi.fn(async () => [] as unknown[]),
    saveResume: vi.fn(async () => undefined),
    watchSession: vi.fn(() => () => undefined),
  };
  const auth = {
    user: signal({ uid: 'u1', email: 'ana@indab.co' }),
    profile: signal({ displayName: 'Ana' }),
    isStaff: signal(false),
    isAdmin: signal(false),
  };

  const create = async () => {
    fixture = TestBed.createComponent(Practice);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    now = NOW;
    feed = null;
    practice.activeSessions.mockResolvedValue([]);
    practice.sessionTrades.mockResolvedValue([]);
    TestBed.configureTestingModule({
      imports: [Practice],
      providers: [
        ...quiet.providers,
        ...quietChartSettings().providers,
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: MarketDataService, useValue: market },
        { provide: PracticeService, useValue: practice },
        {
          provide: EvaluationService,
          useValue: { assignedTo: async () => [], get: async () => null },
        },
        { provide: LiveFeed, useValue: liveFeed },
        { provide: ServerClock, useValue: { now: () => now, sync: async () => undefined } },
      ],
    });
    TestBed.overrideComponent(Practice, {
      remove: { imports: [ReplayChart] },
      add: { imports: [FakeChart] },
    });
  });

  const pickLive = async () => {
    const radio = [...el.querySelectorAll<HTMLInputElement>('input[name="mode"]')][1];
    radio.click();
    await fixture.whenStable();
  };
  const submit = () => el.querySelector<HTMLButtonElement>('form.setup button[type="submit"]')!;
  const price = () => el.querySelector('.toolbar .price')!.textContent!.trim();

  it('starts a live session on the market as it is now and follows the stream', async () => {
    await create();
    await pickLive();
    expect(el.textContent).toContain('el mercado de ahora');
    expect(submit().textContent).toContain('Empezar en vivo');
    submit().click();
    await fixture.whenStable();

    const anchor = chartAnchor(NOW);
    expect(market.loadMinutesSince).toHaveBeenCalledWith('XAUUSDT', anchor - MINUTE, 1);
    expect(practice.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        live: true,
        replayStart: Math.floor(NOW / MINUTE) * MINUTE,
        startingBalance: 200,
      }),
    );
    expect(liveFeed.connect).toHaveBeenCalledWith('XAUUSDT', expect.anything());
    // No play, step or speed: the market sets the pace.
    expect(el.querySelector('app-replay-controls .live')).not.toBeNull();
    expect(el.querySelector('app-replay-controls .deck')).toBeNull();
    expect(el.querySelector('.live-status')!.textContent).toContain('Conectando');

    feed!.status('live');
    const minute = Math.floor(NOW / MINUTE) * 60;
    feed!.candle({ time: minute, open: 4000, high: 4012, low: 4000, close: 4012.5 });
    await fixture.whenStable();
    expect(price()).toBe('4,012.50');
    expect(el.querySelector('.live-status')!.textContent).toContain('tiempo real');
    // The chart's last 15-minute bar follows the forming minute.
    const chart = fixture.debugElement.query((d) => d.name === 'app-replay-chart')
      .componentInstance as FakeChart;
    expect(chart.candles().at(-1)!.close).toBe(4012.5);
  });

  it('settles orders on the stream and saves them', async () => {
    await create();
    await pickLive();
    submit().click();
    await fixture.whenStable();
    const quickBuy = el.querySelector<HTMLButtonElement>('.quick-buy')!;
    quickBuy.click();
    await fixture.whenStable();
    expect(practice.openTrade).toHaveBeenCalled();
    // Ten dollars up, then the next minute.
    const minute = Math.floor(NOW / MINUTE) * 60;
    feed!.candle(flat(minute + 60, 4010));
    await fixture.whenStable();
    expect(el.querySelector('.open-count .pnl')!.textContent).toContain('+10.00');
  });

  it('fetches what the stream missed when it reconnects', async () => {
    await create();
    await pickLive();
    submit().click();
    await fixture.whenStable();
    const minute = Math.floor(NOW / MINUTE) * 60;
    market.catchUpMinutes.mockResolvedValueOnce([flat(minute, 4001), flat(minute + 60, 4003)]);
    feed!.opened();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(market.catchUpMinutes).toHaveBeenCalledWith('XAUUSDT', minute * 1000);
    expect(price()).toBe('4,003.00');
  });

  it('cannot start while gold is closed', async () => {
    now = SATURDAY;
    await create();
    await pickLive();
    expect(el.textContent).toContain('El mercado del oro está cerrado');
    expect(submit().disabled).toBe(true);
  });

  it('picks a live session up after a reload, settling what happened while away', async () => {
    // Left 20 minutes ago with a buy limit at 3995; the price dipped to 3990 since.
    const left = Math.floor((NOW - 20 * MINUTE) / MINUTE) * 60;
    const order: PracticeTrade = {
      id: 'o1',
      uid: 'u1',
      side: 'long',
      orderType: 'limit',
      orderPrice: 3995,
      placedTime: left,
      quantity: 1,
      entryPrice: 3995,
      entryTime: left,
      stopLoss: null,
      takeProfit: null,
      status: 'pending',
    };
    practice.sessionTrades.mockResolvedValue([order]);
    practice.activeSessions.mockResolvedValue([
      {
        id: 'live-1',
        uid: 'u1',
        symbol: 'XAUUSDT',
        interval: '15m',
        replayStart: (left - 600) * 1000,
        startingBalance: 200,
        status: 'active',
        live: true,
        startedAt: { toMillis: () => (left - 600) * 1000 },
        resume: { time: left, interval: '15m', hideDates: true, speed: 2, drawings: [] },
      },
    ]);
    market.loadMinutesSince.mockImplementation(async (_s: string, from: number) =>
      minutesSince(from).map((c) => (c.time === left + 300 ? flat(c.time, 3990) : c)),
    );
    await create();

    expect(market.loadMinutesSince).toHaveBeenCalledWith(
      'XAUUSDT',
      chartAnchor(left * 1000) - MINUTE,
    );
    expect(practice.fillOrder).toHaveBeenCalledWith(
      'live-1',
      expect.objectContaining({ id: 'o1', status: 'open', entryTime: left + 300 }),
    );
    expect(liveFeed.connect).toHaveBeenCalled();
    expect(el.querySelector('.live-status')).not.toBeNull();
    // Dates are not hidden live.
    const chart = fixture.debugElement.query((d) => d.name === 'app-replay-chart')
      .componentInstance as FakeChart;
    expect(chart.hideDates()).toBe(false);
  });

  it('stops the stream when the student leaves the session open', async () => {
    await create();
    await pickLive();
    submit().click();
    await fixture.whenStable();
    practice.activeSessions.mockResolvedValue([
      {
        id: 'live-1',
        uid: 'u1',
        symbol: 'XAUUSDT',
        interval: '15m',
        replayStart: NOW,
        status: 'active',
        live: true,
        startedAt: { toMillis: () => NOW, toDate: () => new Date(NOW) },
      },
    ]);
    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Salir sin cerrar'))!
      .click();
    await fixture.whenStable();
    expect(closeFeed).toHaveBeenCalled();
    expect(el.querySelector('form.setup')).toBeNull();
    expect(el.textContent).toContain('Práctica en vivo');
  });
});
