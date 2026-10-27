import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Candle, PracticeSession, PracticeTrade } from '../../core/models/practice';
import { MarketDataService } from './market-data.service';
import { PracticeService } from './practice.service';
import { ReplayChart } from './replay-chart';
import { SessionReview } from './session-review';
import { quietNotifications } from '../notifications/testing';

// The real chart needs a canvas; the review only passes it data.
@Component({ selector: 'app-replay-chart', template: '' })
class FakeChart {
  readonly candles = input<Candle[]>([]);
  readonly trades = input<PracticeTrade[]>([]);
  readonly barSeconds = input(0);
  readonly focusTrade = input<string | null>(null);
  readonly startTime = input<number | null>(null);
}

@Component({
  imports: [SessionReview],
  template: `<app-session-review [session]="session()" />`,
})
class Host {
  readonly session = signal({
    id: 's1',
    symbol: 'XAUUSDT',
    interval: '15m',
    replayStart: Date.UTC(2026, 2, 2),
    startingBalance: 200,
  } as PracticeSession);
}

const trade = (
  id: string,
  entryTime: number,
  over: Partial<PracticeTrade> = {},
): PracticeTrade => ({
  id,
  uid: 'u',
  side: 'long',
  orderType: 'market',
  orderPrice: null,
  placedTime: entryTime,
  quantity: 1,
  entryPrice: 2000,
  entryTime,
  stopLoss: null,
  takeProfit: null,
  status: 'closed',
  exitPrice: 2010,
  exitTime: entryTime + 900,
  exitReason: 'manual',
  pnl: 10,
  ...over,
});

describe('SessionReview', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;
  const practice = { sessionTrades: vi.fn() };
  const market = { loadCandles: vi.fn(), loadHistory: vi.fn() };
  const candle: Candle = { time: 1_772_409_600, open: 1, high: 2, low: 0.5, close: 1.5 };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        ...quietNotifications().providers,
        { provide: PracticeService, useValue: practice },
        {
          provide: AuthService,
          useValue: {
            user: signal({ uid: 'coach' }),
            isStaff: signal(true),
            isAdmin: signal(false),
          },
        },
        { provide: MarketDataService, useValue: market },
      ],
    });
    TestBed.overrideComponent(SessionReview, {
      remove: { imports: [ReplayChart] },
      add: { imports: [FakeChart] },
    });
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };
  const chart = () =>
    fixture.debugElement.query((d) => d.componentInstance instanceof FakeChart)
      ?.componentInstance as FakeChart | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    market.loadHistory.mockResolvedValue([candle]);
    market.loadCandles.mockResolvedValue([]);
    // Logged out of order, with an order that never filled.
    practice.sessionTrades.mockResolvedValue([
      trade('second', 2_000),
      trade('never', 500, { status: 'cancelled' }),
      trade('first', 1_000),
    ]);
  });

  it('focuses the first filled trade and follows the navigator and the table', async () => {
    await render();
    expect(practice.sessionTrades).toHaveBeenCalledWith('s1');
    expect(chart()?.barSeconds()).toBe(900);
    expect(chart()?.focusTrade()).toBe('first');
    expect(el.querySelector('.counter')!.textContent).toContain('Operación 1 de 2');

    [...el.querySelectorAll('button')].find((b) => /Siguiente/.test(b.textContent!))!.click();
    await fixture.whenStable();
    expect(chart()?.focusTrade()).toBe('second');

    // A row of the table picks its trade; a cancelled order has nothing to show.
    const rows = [...el.querySelectorAll<HTMLElement>('table.trades tbody tr')];
    rows[2].click();
    await fixture.whenStable();
    expect(chart()?.focusTrade()).toBe('first');
    expect(rows[2].getAttribute('aria-current')).toBe('true');
    rows[1].click();
    await fixture.whenStable();
    expect(chart()?.focusTrade()).toBe('first');
  });

  it('says when no order was filled and when the trades cannot load', async () => {
    practice.sessionTrades.mockResolvedValue([trade('never', 500, { status: 'cancelled' })]);
    await render();
    expect(el.querySelector('app-trade-navigator')).toBeNull();
    expect(el.textContent).toContain('Ninguna orden de esta sesión llegó a ejecutarse.');

    practice.sessionTrades.mockRejectedValue(new Error('denied'));
    fixture.componentInstance.session.set({ ...fixture.componentInstance.session(), id: 's2' });
    await fixture.whenStable();
    expect(el.textContent).toContain('No se pudieron cargar las operaciones de la sesión.');
  });
});
