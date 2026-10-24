import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Candle } from '../../core/models/practice';
import { HISTORY_BARS, MarketDataService } from './market-data.service';
import { Practice, formatCountdown } from './practice';
import { PracticeService } from './practice.service';
import { EvaluationService } from '../evaluations/evaluation.service';
import { Evaluation } from '../../core/models/evaluation';
import { LevelMove, LevelRemove, OrderAt, OrderDraft, ReplayChart } from './replay-chart';

// The real chart needs a canvas; the page only passes it data.
@Component({ selector: 'app-replay-chart', template: '<ng-content />' })
class FakeChart {
  readonly candles = input<Candle[]>([]);
  readonly trades = input<unknown[]>([]);
  readonly hideDates = input(false);
  readonly barSeconds = input(0);
  readonly draft = input<OrderDraft | null>(null);
  readonly levelMoved = output<LevelMove>();
  readonly levelRemoved = output<LevelRemove>();
  readonly tradeClosed = output<string>();
  readonly symbol = input('');
  readonly draftSubmitted = output<void>();
  readonly lotsChanged = output<string>();
  readonly orderAt = output<OrderAt>();
}

/**
 * A fake Binance: 100 before the replay start, then every minute of the k-th 15-minute bar at
 * 101 + k, so each 15-minute step raises the price by 1. The start is read off the requests.
 */
let begin = 0;
const price = (time: number) => (time < begin ? 100 : 101 + Math.floor((time - begin) / 900));
const klines = (interval: string, from: number, limit = 1000, minutes = Infinity): Candle[] => {
  const seconds = { '1m': 60, '15m': 900, '1h': 3600, '4h': 14400 }[interval]!;
  if (interval === '1m') {
    begin ||= from / 1000 + 60;
  } else {
    begin ||= from / 1000 + HISTORY_BARS * seconds;
  }
  const count =
    interval === '1m' ? Math.min(limit, minutes - (from / 1000 - begin + 60) / 60) : limit;
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const time = from / 1000 + i * seconds;
    const close = price(time);
    return { time, open: close, high: close, low: close, close };
  });
};

describe('Practice page', () => {
  let fixture: ComponentFixture<Practice>;
  let el: HTMLElement;
  const market = { loadCandles: vi.fn() };
  const practice = {
    startSession: vi.fn(async () => 'session-1'),
    newTradeId: vi.fn(),
    openTrade: vi.fn(async () => undefined),
    fillOrder: vi.fn(async () => undefined),
    cancelOrder: vi.fn(async () => undefined),
    updateLevels: vi.fn(async () => undefined),
    closeTrade: vi.fn(async () => undefined),
    updateSummary: vi.fn(async () => undefined),
    finishSession: vi.fn(async () => undefined),
    mySessions: vi.fn(async () => [] as unknown[]),
    myAttempts: vi.fn(async () => [] as unknown[]),
  };
  const evaluations = { assignedTo: vi.fn(async () => [] as Evaluation[]) };
  const auth = {
    user: signal({ uid: 'u1', email: 'ana@indab.co' }),
    profile: signal({ displayName: 'Ana' }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    evaluations.assignedTo.mockResolvedValue([]);
    practice.myAttempts.mockResolvedValue([]);
    let n = 0;
    practice.newTradeId.mockImplementation(() => `t${++n}`);
    begin = 0;
    market.loadCandles.mockImplementation(
      async (_symbol: string, interval: string, from: number, limit?: number) =>
        klines(interval, from, limit),
    );
    practice.mySessions.mockResolvedValue([
      {
        id: 'old',
        symbol: 'PAXGUSDT',
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
        { provide: EvaluationService, useValue: evaluations },
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
  const pressed = async (selector: string) => {
    el.querySelector<HTMLButtonElement>(selector)!.click();
    await fixture.whenStable();
  };
  const submit = () => pressed('button.submit');
  const submitLabel = () =>
    [...el.querySelector('button.submit')!.children].map((c) => c.textContent!.trim()).join(' ');
  /** Ticks or unticks the take profit / stop loss checkbox. */
  const toggle = async (label: string) => {
    [...el.querySelectorAll<HTMLLabelElement>('label.switch')]
      .find((l) => l.textContent?.trim() === label)!
      .querySelector('input')!
      .click();
    await fixture.whenStable();
  };
  const setLevel = async (label: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`input[aria-label="Precio del ${label}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const alert = () => el.querySelector('[role="alert"]')?.textContent ?? '';
  const chart = () =>
    fixture.debugElement.query((d) => d.componentInstance instanceof FakeChart)
      ?.componentInstance as FakeChart;
  const start = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };

  const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
  const evaluation = (id: string, extra: Partial<Record<keyof Evaluation, unknown>> = {}) =>
    ({
      id,
      title: `Evaluación ${id}`,
      description: 'Opera solo con stop loss.',
      symbol: 'PAXGUSDT',
      replayStart: Date.UTC(2024, 0, 2, 8),
      hideDates: true,
      startingBalance: 200,
      durationMinutes: 30,
      opensAt: at(Date.now() - 3_600_000),
      closesAt: at(Date.now() + 3_600_000),
      studentIds: ['u1'],
      resultsPublished: false,
      ...extra,
    }) as unknown as Evaluation;
  /** Renders the page again after the fakes changed. */
  const reload = async () => {
    fixture.destroy();
    fixture = TestBed.createComponent(Practice);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };

  it('formats the countdown', () => {
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it("lists the student's evaluations by state", async () => {
    evaluations.assignedTo.mockResolvedValue([
      evaluation('open'),
      evaluation('done'),
      evaluation('later', {
        opensAt: at(Date.now() + 3_600_000),
        closesAt: at(Date.now() + 7_200_000),
      }),
      evaluation('past', {
        opensAt: at(Date.now() - 7_200_000),
        closesAt: at(Date.now() - 3_600_000),
      }),
    ]);
    practice.myAttempts.mockResolvedValue([{ id: 'done_u1', evaluationId: 'done', pnl: 12.5 }]);
    await reload();
    expect(practice.myAttempts).toHaveBeenCalledWith('u1', ['open', 'done', 'later', 'past']);
    const cards = [...el.querySelectorAll('.evaluation')].map((c) => c.textContent);
    expect(cards[0]).toContain('Comenzar evaluación');
    expect(cards[0]).toContain('30 min');
    expect(cards[1]).toContain('Presentada');
    expect(cards[1]).toContain('12.50');
    expect(cards[2]).toContain('Aún no abre');
    expect(cards[3]).toContain('No presentada');
    expect(el.textContent).toContain('Práctica libre');
  });

  it('takes an evaluation on its market and start, against the clock', async () => {
    const ev = evaluation('e1', { hideDates: false });
    evaluations.assignedTo.mockResolvedValue([ev]);
    await reload();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('Comenzar evaluación');
    expect(confirm.mock.calls[0][0]).toContain('un solo intento de 30 minutos');
    expect(begin * 1000).toBe(ev.replayStart);
    expect(practice.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'PAXGUSDT',
        replayStart: ev.replayStart,
        startingBalance: 200,
      }),
      ev,
    );
    expect(chart().hideDates()).toBe(false);
    const bar = el.querySelector('.evaluation-bar')!.textContent!;
    expect(bar).toContain('Evaluación: Evaluación e1');
    expect(bar).toMatch(/Quedan (29:5\d|30:00)/);
    confirm.mockRestore();
  });

  it('finishes the evaluation when its time runs out', async () => {
    // A 0.6-second limit, so the test does not wait half an hour.
    evaluations.assignedTo.mockResolvedValue([evaluation('e1', { durationMinutes: 0.01 })]);
    await reload();
    const loads = evaluations.assignedTo.mock.calls.length;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('Comenzar evaluación');
    await pressed('.quick-buy');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await fixture.whenStable();
    expect(practice.closeTrade).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ exitReason: 'sessionEnd' }),
    );
    expect(practice.finishSession).toHaveBeenCalled();
    expect(el.textContent).toContain('Sesión terminada');
    // The card now shows it as taken.
    expect(evaluations.assignedTo).toHaveBeenCalledTimes(loads + 1);
  });

  it('explains when the evaluation cannot start', async () => {
    evaluations.assignedTo.mockResolvedValue([evaluation('e1')]);
    await reload();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    practice.startSession.mockRejectedValueOnce(new Error('permission-denied'));
    await click('Comenzar evaluación');
    expect(alert()).toContain('Puede que ya la hayas presentado');
    expect(el.querySelector('form')).not.toBeNull();
  });

  it("shows the setup form and the student's past sessions", () => {
    expect(el.querySelector('h1')?.textContent).toContain('Práctica de trading');
    // Only the market: the practice starts on 15 minutes and switches inside.
    expect(el.querySelectorAll('select')).toHaveLength(1);
    expect(el.textContent).toContain('Empiezas con 200 USD virtuales y apalancamiento 1:100');
    expect(practice.mySessions).toHaveBeenCalledWith('u1');
    expect(el.textContent).toContain('PAXGUSDT · 4h');
    expect(el.textContent).toContain('Terminada');
  });

  it('starts on 15 minutes at a random 4-hour boundary, with the dates hidden', async () => {
    await start();
    // One-minute candles from the minute before the start, and 15-minute history before it.
    expect(begin % (4 * 3600)).toBe(0);
    expect(market.loadCandles).toHaveBeenCalledWith('PAXGUSDT', '1m', (begin - 60) * 1000);
    expect(market.loadCandles).toHaveBeenCalledWith(
      'PAXGUSDT',
      '15m',
      (begin - HISTORY_BARS * 900) * 1000,
      HISTORY_BARS,
    );
    expect(practice.startSession).toHaveBeenCalledWith({
      uid: 'u1',
      userName: 'Ana',
      symbol: 'PAXGUSDT',
      interval: '15m',
      replayStart: begin * 1000,
      startingBalance: 200,
    });
    expect(chart().candles()).toHaveLength(HISTORY_BARS);
    expect(chart().barSeconds()).toBe(900);
    expect(chart().hideDates()).toBe(true);

    // Each step is one 15-minute bar built from its minutes.
    await click('Siguiente vela');
    expect(chart().candles()).toHaveLength(HISTORY_BARS + 1);
    expect(chart().candles().at(-1)).toEqual({
      time: begin,
      open: 101,
      high: 101,
      low: 101,
      close: 101,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();
    expect(chart().candles()).toHaveLength(HISTORY_BARS + 2);
    expect(el.querySelector('.elapsed')!.textContent).toContain('30 min');
  });

  it('starts on the date the student picks', async () => {
    const radio = [...el.querySelectorAll('label.check')]
      .find((l) => l.textContent?.trim() === 'Elegir fecha')!
      .querySelector('input')!;
    radio.click();
    await fixture.whenStable();
    const date = el.querySelector<HTMLInputElement>('input[aria-label="Fecha de inicio"]')!;
    expect(date.min).toBe('2020-12-23');
    date.value = '2023-06-15';
    date.dispatchEvent(new Event('input'));
    await start();
    expect(begin * 1000).toBe(Date.UTC(2023, 5, 15));
    expect(practice.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ replayStart: Date.UTC(2023, 5, 15) }),
    );
  });

  it('switches timeframe during the practice, loading its history once', async () => {
    await start();
    await click('Siguiente vela');
    await click('1h');
    expect(market.loadCandles).toHaveBeenCalledWith(
      'PAXGUSDT',
      '1h',
      (begin - HISTORY_BARS * 3600) * 1000,
      HISTORY_BARS,
    );
    // HISTORY_BARS hours of history and the hour being formed by the first 15 minutes.
    expect(chart().barSeconds()).toBe(3600);
    expect(chart().candles()).toHaveLength(HISTORY_BARS + 1);
    expect(chart().candles().at(-1)).toMatchObject({ time: begin, close: 101 });

    // The next step completes that hour.
    await click('Siguiente vela');
    expect(chart().candles().at(-1)).toMatchObject({ time: begin, close: 104 });
    expect(chart().candles()).toHaveLength(HISTORY_BARS + 1);

    await click('15m');
    expect(chart().candles()).toHaveLength(HISTORY_BARS + 4);
    expect(market.loadCandles).toHaveBeenCalledTimes(3);
  });

  it('builds every timeframe from the same candles, history and replay alike', async () => {
    // A market whose minutes all differ, served the way Binance does: a bar of any interval
    // is the open of its first minute, the highest high, lowest low and close of its last.
    const minute = (t: number): Candle => {
      const m = t / 60;
      const base = 2000 + 20 * Math.sin(m / 50) + ((m * 7) % 5);
      const open = base + ((m * 37) % 11) / 10;
      const close = base + ((m * 53) % 13) / 10;
      return {
        time: t,
        open,
        close,
        high: Math.max(open, close) + ((m * 17) % 5) / 10,
        low: Math.min(open, close) - ((m * 29) % 7) / 10,
      };
    };
    const seconds: Record<string, number> = {
      '1m': 60,
      '3m': 180,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '4h': 14400,
    };
    market.loadCandles.mockImplementation(
      async (_symbol: string, interval: string, from: number, limit = 1000) => {
        const s = seconds[interval];
        return Array.from(
          { length: limit },
          (_, i) =>
            aggregate(
              Array.from({ length: s / 60 }, (_, k) => minute(from / 1000 + i * s + k * 60)),
              s,
            )[0],
        );
      },
    );

    await start();
    for (let i = 0; i < 5; i++) {
      await click('Siguiente vela');
    }
    // Seven minutes into the next 15 minutes: every timeframe has a bar in the making.
    await click('1m');
    for (let i = 0; i < 7; i++) {
      await click('Siguiente vela');
    }
    const bars: Record<string, Candle[]> = {};
    for (const tf of Object.keys(seconds)) {
      await click(tf);
      bars[tf] = chart().candles();
    }

    const pairs = [
      ['1m', '3m'],
      ['1m', '5m'],
      ['5m', '15m'],
      ['15m', '1h'],
      ['1h', '4h'],
    ];
    for (const [lower, higher] of pairs) {
      const from = bars[lower][0].time;
      const built = aggregate(bars[lower], seconds[higher]);
      const covered = bars[higher].filter((b) => b.time >= from);
      expect(covered.length, `${higher} from ${lower}`).toBeGreaterThan(1);
      expect(covered, `${higher} from ${lower}`).toEqual(built.slice(-covered.length));
    }
    // ...and they all end at the same moment, on the current price.
    const last = Object.values(bars).map((list) => list.at(-1)!.close);
    expect(new Set(last).size).toBe(1);
  });

  it('fetches more minutes before they run out', async () => {
    await start();
    await click('4h');
    await click('Siguiente vela');
    await click('Siguiente vela');
    // 480 of the first 1000 minutes replayed: the next chunk starts after the last one.
    expect(market.loadCandles).toHaveBeenLastCalledWith(
      'PAXGUSDT',
      '1m',
      (begin + 999 * 60) * 1000,
    );
    await fixture.whenStable();
    await click('Siguiente vela');
    await click('Siguiente vela');
    await click('Siguiente vela');
    expect(el.querySelector('.market .price')!.textContent).toContain('180');
  });

  it('shows an error and stays on the setup when the data cannot load', async () => {
    market.loadCandles.mockRejectedValueOnce(new Error('offline'));
    await start();
    expect(alert()).toContain('No se pudieron cargar los datos del mercado');
    expect(el.querySelector('form')).not.toBeNull();
    expect(practice.startSession).not.toHaveBeenCalled();
  });

  it('opens a trade from the order panel with a stop loss, then closes it', async () => {
    await start();
    // 0.01 lots at 100 is 1 unit: 1 USD of margin.
    expect(submitLabel()).toBe('Comprar 0.01 PAXGUSDT MERCADO');
    await toggle('Stop loss');
    expect(chart().draft()).toMatchObject({ stopLoss: 99, quantity: 1 });
    expect(el.querySelector('.bracket .field')!.textContent).toContain('-1.00 USD');

    await setLevel('stop loss', '101');
    await submit();
    expect(alert()).toContain('por debajo');
    expect(practice.openTrade).not.toHaveBeenCalled();

    await setLevel('stop loss', '90');
    await submit();
    expect(practice.openTrade).toHaveBeenCalledWith(
      'session-1',
      'u1',
      expect.objectContaining({ side: 'long', entryPrice: 100, stopLoss: 90, quantity: 1 }),
    );
    // The ticket is ready for the next order.
    expect(chart().draft()?.stopLoss).toBeNull();
    expect(el.textContent).toContain('Posiciones (1)');

    await click('Siguiente vela');
    expect(el.querySelector('.account')!.textContent).toContain('+1.00');
    await click('Cerrar');
    expect(practice.closeTrade).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ exitPrice: 101, exitReason: 'manual', pnl: 1 }),
    );
    expect(practice.updateSummary).toHaveBeenCalledWith('session-1', {
      balance: 201,
      pnl: 1,
      tradeCount: 1,
    });
    await click('Historial (1)');
    expect(el.textContent).toContain('Manual');
  });

  it('shows the reward to risk of the ticket and sizes from the available balance', async () => {
    await start();
    await toggle('Take profit');
    await toggle('Stop loss');
    // SL 1% and TP 2% away from 100.
    expect(el.querySelector('.ratio')!.textContent).toContain('2.00');
    await toggle('Take profit');
    expect(el.querySelector('.ratio')).toBeNull();

    // 200 USD of free margin at 1 USD per 0.01 lots.
    await click('50%');
    expect(submitLabel()).toBe('Comprar 1.00 PAXGUSDT MERCADO');
    await click('Máx.');
    expect(submitLabel()).toBe('Comprar 2.00 PAXGUSDT MERCADO');
  });

  it('drops a trade that could not be logged', async () => {
    await start();
    practice.openTrade.mockRejectedValueOnce(new Error('denied'));
    await submit();
    expect(alert()).toContain('No se pudo registrar la operación');
    expect(el.textContent).toContain('No tienes posiciones abiertas.');
  });

  it('sells in one click from the chart and closes it when the session ends', async () => {
    await start();
    await pressed('.quick-sell');
    expect(practice.openTrade).toHaveBeenCalledWith(
      'session-1',
      'u1',
      expect.objectContaining({ side: 'short', orderType: 'market', stopLoss: null }),
    );
    await click('Siguiente vela');
    await click('Estadísticas');
    expect(el.querySelector('app-session-stats')?.textContent).toContain(
      'Cierra operaciones para ver cómo evoluciona tu saldo.',
    );
    await click('Terminar sesión');

    expect(practice.closeTrade).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ side: 'short', exitReason: 'sessionEnd', pnl: -1 }),
    );
    expect(practice.finishSession).toHaveBeenCalledWith('session-1', {
      balance: 199,
      pnl: -1,
      tradeCount: 1,
    });
    expect(el.textContent).toContain('Sesión terminada');
    expect(el.querySelector('app-session-stats svg')?.getAttribute('aria-label')).toBe(
      'Saldo de 200 a 199 USD',
    );
    expect(chart().hideDates()).toBe(false);

    await click('Nueva práctica');
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('adds and removes the stop loss of an open position', async () => {
    await start();
    await submit();
    await click('+ SL');
    expect(practice.updateLevels).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({ id: 't1', stopLoss: 99, takeProfit: null }),
    );
    await pressed('button[aria-label="Quitar stop loss"]');
    expect(practice.updateLevels).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({ id: 't1', stopLoss: null }),
    );
  });

  const drag = async (move: LevelMove) => {
    chart().levelMoved.emit(move);
    await fixture.whenStable();
  };

  it('trades from the chart: its order line button and its "+" menu', async () => {
    await start();
    // "+" → "Buy 0.01 @ 99 limit" places it at once.
    chart().orderAt.emit({ side: 'long', orderType: 'limit', price: 99, place: true });
    await fixture.whenStable();
    expect(practice.openTrade).toHaveBeenLastCalledWith(
      'session-1',
      'u1',
      expect.objectContaining({ side: 'long', orderType: 'limit', orderPrice: 99 }),
    );
    expect(el.textContent).toContain('Compra límite');

    // "+" → "Add order at 103" fills in the panel; the line's button places it.
    chart().orderAt.emit({ side: 'short', orderType: 'limit', price: 103, place: false });
    await fixture.whenStable();
    expect(submitLabel()).toBe('Vender 0.01 PAXGUSDT LÍMITE 103.000');
    chart().draftSubmitted.emit();
    await fixture.whenStable();
    expect(practice.openTrade).toHaveBeenLastCalledWith(
      'session-1',
      'u1',
      expect.objectContaining({ side: 'short', orderType: 'limit', orderPrice: 103 }),
    );
  });

  it('takes the lot size from the chart too, in steps of 0.01', async () => {
    await start();
    const quick = el.querySelector<HTMLInputElement>('.quick input[aria-label="Lotes"]')!;
    quick.value = '0.034';
    quick.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(quick.value).toBe('0.03');
    expect(chart().draft()?.quantity).toBe(3);
    expect(submitLabel()).toBe('Comprar 0.03 PAXGUSDT MERCADO');

    chart().lotsChanged.emit('0.2');
    await fixture.whenStable();
    expect(quick.value).toBe('0.20');
    chart().lotsChanged.emit('0');
    await fixture.whenStable();
    expect(quick.value).toBe('0.01');
  });

  it('places a limit order that fills later, and drags its lines', async () => {
    await start();
    await click('Límite');
    // A buy limit starts just below the market (100), shown as a line to drag.
    expect(chart().draft()).toMatchObject({
      side: 'long',
      orderType: 'limit',
      price: 99.5,
      stopLoss: null,
      takeProfit: null,
    });
    await toggle('Stop loss');
    await toggle('Take profit');
    expect(chart().draft()).toMatchObject({ stopLoss: 98.505, takeProfit: 101.49 });

    await drag({ target: 'draft', field: 'price', price: 102 });
    await submit();
    expect(alert()).toContain(
      'Una compra límite debe tener su precio por debajo del precio actual.',
    );
    await drag({ target: 'draft', field: 'price', price: 99 });
    await drag({ target: 'draft', field: 'stopLoss', price: 98 });
    expect(submitLabel()).toBe('Comprar 0.01 PAXGUSDT LÍMITE 99.000');
    await submit();
    expect(practice.openTrade).toHaveBeenCalledWith(
      'session-1',
      'u1',
      expect.objectContaining({
        orderType: 'limit',
        orderPrice: 99,
        stopLoss: 98,
        status: 'pending',
      }),
    );
    expect(el.textContent).toContain('Órdenes (1)');
    expect(el.textContent).toContain('Compra límite');

    const id: string = practice.newTradeId.mock.results.at(-1)!.value;
    // Dragging the pending order's take profit saves it; an invalid drag is refused.
    await drag({ target: id, field: 'takeProfit', price: 103 });
    expect(practice.updateLevels).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ id, takeProfit: 103, orderPrice: 99 }),
    );
    await drag({ target: id, field: 'stopLoss', price: 99.5 });
    expect(alert()).toContain('stop loss');
    expect(practice.updateLevels).toHaveBeenCalledTimes(1);

    await click('Cancelar');
    expect(practice.cancelOrder).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ id, status: 'cancelled' }),
    );
    expect(el.textContent).toContain('No tienes órdenes pendientes.');
  });

  it('fills a stop order when the price reaches it', async () => {
    await start();
    await click('Stop');
    expect(chart().draft()?.price).toBe(100.5);
    await submit();
    expect(practice.fillOrder).not.toHaveBeenCalled();
    // The next candle opens at 101, above the stop: it fills at the open.
    await click('Siguiente vela');
    expect(practice.fillOrder).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ status: 'open', entryPrice: 101, orderType: 'stop' }),
    );
    expect(practice.updateSummary).toHaveBeenCalledWith('session-1', {
      balance: 200,
      pnl: 0,
      tradeCount: 1,
    });
  });

  it('ends the session by itself after the last candle', async () => {
    // 50 bars of 15 minutes and no more.
    market.loadCandles.mockImplementation(
      async (_symbol: string, interval: string, from: number, limit?: number) =>
        klines(interval, from, limit, 1 + 50 * 15),
    );
    await start();
    for (let i = 0; i < 50; i++) {
      button('Siguiente vela').click();
    }
    await fixture.whenStable();
    expect(practice.finishSession).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Sesión terminada');
  });
});

/** Bars of `seconds` made of consecutive smaller bars, as a chart platform builds them. */
function aggregate(candles: Candle[], seconds: number): Candle[] {
  const bars: Candle[] = [];
  for (const c of candles) {
    const time = Math.floor(c.time / seconds) * seconds;
    const last = bars.at(-1);
    if (last?.time === time) {
      bars[bars.length - 1] = {
        time,
        open: last.open,
        high: Math.max(last.high, c.high),
        low: Math.min(last.low, c.low),
        close: c.close,
      };
    } else {
      bars.push({ ...c, time });
    }
  }
  return bars;
}
