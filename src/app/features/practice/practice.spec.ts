import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Candle } from '../../core/models/practice';
import { HISTORY_BARS, MarketDataService } from './market-data.service';
import { Practice } from './practice';
import { PracticeService } from './practice.service';
import { ReplayChart } from './replay-chart';

// The real chart needs a canvas; the page only passes it data.
@Component({ selector: 'app-replay-chart', template: '' })
class FakeChart {
  readonly candles = input<Candle[]>([]);
  readonly trades = input<unknown[]>([]);
  readonly hideDates = input(false);
}

/** History at 100, then candles rising by 1 each. */
const candles = (replayed = 60): Candle[] =>
  Array.from({ length: HISTORY_BARS + replayed }, (_, i) => {
    const close = i < HISTORY_BARS ? 100 : 100 + (i - HISTORY_BARS + 1);
    return { time: 1000 + i * 3600, open: close, high: close, low: close, close };
  });

describe('Practice page', () => {
  let fixture: ComponentFixture<Practice>;
  let el: HTMLElement;
  const market = { loadRandomWindow: vi.fn() };
  const practice = {
    startSession: vi.fn(async () => 'session-1'),
    newTradeId: vi.fn(),
    openTrade: vi.fn(async () => undefined),
    closeTrade: vi.fn(async () => undefined),
    updateSummary: vi.fn(async () => undefined),
    finishSession: vi.fn(async () => undefined),
    mySessions: vi.fn(async () => [] as unknown[]),
  };
  const auth = {
    user: signal({ uid: 'u1', email: 'ana@indab.co' }),
    profile: signal({ displayName: 'Ana' }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    let n = 0;
    practice.newTradeId.mockImplementation(() => `t${++n}`);
    market.loadRandomWindow.mockResolvedValue(candles());
    practice.mySessions.mockResolvedValue([
      {
        id: 'old',
        symbol: 'USDJPY',
        interval: '4h',
        tradeCount: 3,
        pnl: -12.5,
        status: 'finished',
        startedAt: { toDate: () => new Date(2026, 9, 1) },
      },
    ]);
    TestBed.configureTestingModule({
      imports: [Practice],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: MarketDataService, useValue: market },
        { provide: PracticeService, useValue: practice },
      ],
    });
    TestBed.overrideComponent(Practice, {
      remove: { imports: [ReplayChart] },
      add: { imports: [FakeChart] },
    });
    fixture = TestBed.createComponent(Practice);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  const click = async (name: string) => {
    button(name).click();
    await fixture.whenStable();
  };
  const fill = async (label: string, value: string) => {
    const input = [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(label))!
      .querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const chart = () =>
    fixture.debugElement.query((d) => d.componentInstance instanceof FakeChart)
      ?.componentInstance as FakeChart;
  const start = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };

  it("shows the setup form and the student's past sessions", () => {
    expect(el.querySelector('h1')?.textContent).toContain('Práctica de trading');
    expect(el.querySelectorAll('select')).toHaveLength(2);
    expect(practice.mySessions).toHaveBeenCalledWith('u1');
    expect(el.textContent).toContain('USDJPY · 4h');
    expect(el.textContent).toContain('Terminada');
  });

  it('starts a session on a random window with the dates hidden', async () => {
    await start();
    expect(market.loadRandomWindow).toHaveBeenCalledWith('XAUUSD', '1h');
    expect(practice.startSession).toHaveBeenCalledWith({
      uid: 'u1',
      userName: 'Ana',
      symbol: 'XAUUSD',
      interval: '1h',
      replayStart: (1000 + HISTORY_BARS * 3600) * 1000,
      startingBalance: 10000,
    });
    expect(chart().candles()).toHaveLength(HISTORY_BARS);
    expect(chart().hideDates()).toBe(true);

    await click('Siguiente vela');
    expect(chart().candles()).toHaveLength(HISTORY_BARS + 1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();
    expect(chart().candles()).toHaveLength(HISTORY_BARS + 2);
  });

  it('shows an error and stays on the setup when the data cannot load', async () => {
    market.loadRandomWindow.mockRejectedValueOnce(new Error('offline'));
    await start();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudieron cargar los datos del mercado',
    );
    expect(el.querySelector('form')).not.toBeNull();
    expect(practice.startSession).not.toHaveBeenCalled();
  });

  it('opens, logs and closes trades', async () => {
    await start();
    await fill('Monto', '1000');
    await fill('Stop loss', '101');
    await click('Abrir operación');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('por debajo');
    expect(practice.openTrade).not.toHaveBeenCalled();

    await fill('Stop loss', '90');
    await click('Abrir operación');
    expect(practice.openTrade).toHaveBeenCalledWith(
      'session-1',
      'u1',
      expect.objectContaining({ side: 'long', entryPrice: 100, stopLoss: 90, quantity: 10 }),
    );

    await click('Siguiente vela');
    await click('Cerrar');
    expect(practice.closeTrade).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ exitPrice: 101, exitReason: 'manual', pnl: 10 }),
    );
    expect(practice.updateSummary).toHaveBeenCalledWith('session-1', {
      balance: 10010,
      pnl: 10,
      tradeCount: 1,
    });
    expect(el.textContent).toContain('Manual');
  });

  it('drops a trade that could not be logged', async () => {
    await start();
    practice.openTrade.mockRejectedValueOnce(new Error('denied'));
    await click('Abrir operación');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo registrar la operación',
    );
    expect(el.textContent).toContain('No tienes operaciones abiertas.');
  });

  it('closes open trades and saves the result when the session ends', async () => {
    await start();
    await button('Vender').click();
    await click('Abrir operación');
    await click('Siguiente vela');
    await click('Terminar sesión');

    expect(practice.closeTrade).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ side: 'short', exitReason: 'sessionEnd', pnl: -10 }),
    );
    expect(practice.finishSession).toHaveBeenCalledWith('session-1', {
      balance: 9990,
      pnl: -10,
      tradeCount: 1,
    });
    expect(el.textContent).toContain('Sesión terminada');
    expect(chart().hideDates()).toBe(false);

    await click('Nueva práctica');
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('ends the session by itself after the last candle', async () => {
    market.loadRandomWindow.mockResolvedValueOnce(candles(50));
    await start();
    for (let i = 0; i < 50; i++) {
      button('Siguiente vela').click();
    }
    await fixture.whenStable();
    expect(practice.finishSession).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Sesión terminada');
  });
});
