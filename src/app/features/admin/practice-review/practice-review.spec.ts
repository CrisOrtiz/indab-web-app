import { Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { Candle } from '../../../core/models/practice';
import { HISTORY_BARS, MarketDataService } from '../../practice/market-data.service';
import { EvaluationService } from '../../evaluations/evaluation.service';
import { PracticeService } from '../../practice/practice.service';
import { ReplayChart } from '../../practice/replay-chart';
import { SessionReview } from '../../practice/session-review';
import { PracticeReview, REVIEW_PAGE_SIZE } from './practice-review';

// The real chart needs a canvas; the review only passes it data.
@Component({ selector: 'app-replay-chart', template: '' })
class FakeChart {
  readonly candles = input<Candle[]>([]);
  readonly trades = input<unknown[]>([]);
  readonly barSeconds = input(0);
  readonly focusTrade = input<string | null>(null);
  readonly startTime = input<number | null>(null);
}

const candle: Candle = { time: 1_620_000_000, open: 1, high: 2, low: 0.5, close: 1.5 };
const later: Candle = { time: 1_620_604_800, open: 1.5, high: 1.6, low: 1.4, close: 1.55 };

const session = (id: string, uid: string, userName: string, symbol: string, pnl: number) => ({
  id,
  uid,
  userName,
  symbol,
  interval: '1h',
  replayStart: Date.UTC(2021, 4, 10),
  tradeCount: 2,
  pnl,
  status: 'finished',
  startedAt: { toDate: () => new Date(2026, 9, 20) },
});

describe('PracticeReview', () => {
  let fixture: ComponentFixture<PracticeReview>;
  let el: HTMLElement;
  const practice = {
    sessionsPage: vi.fn(),
    sessionTotals: vi.fn(),
    sessionTrades: vi.fn(),
    deleteSession: vi.fn(),
  };
  const evaluations = {
    students: vi.fn(async () => [
      { uid: 'ana', name: 'Ana' },
      { uid: 'luis', name: 'Luis' },
    ]),
    all: vi.fn(async () => [{ id: 'e1', title: 'Evaluación de octubre' }]),
  };
  const market = { loadCandles: vi.fn(), loadHistory: vi.fn() };
  const isAdmin = signal(true);

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [PracticeReview],
      providers: [
        provideRouter([]),
        { provide: PracticeService, useValue: practice },
        { provide: EvaluationService, useValue: evaluations },
        { provide: MarketDataService, useValue: market },
        { provide: AuthService, useValue: { isAdmin } },
      ],
    });
    TestBed.overrideComponent(SessionReview, {
      remove: { imports: [ReplayChart] },
      add: { imports: [FakeChart] },
    });
    fixture = TestBed.createComponent(PracticeReview);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    market.loadHistory.mockResolvedValue([candle]);
    market.loadCandles.mockResolvedValue([later]);
    practice.deleteSession.mockResolvedValue(undefined);
    practice.sessionsPage.mockResolvedValue({
      items: [
        session('s1', 'ana', 'Ana', 'PAXGUSDT', 25),
        session('s2', 'ana', 'Ana', 'BTCUSDT', -5),
        session('s3', 'luis', 'Luis', 'PAXGUSDT', 0),
      ],
      last: 'cursor-1',
      hasMore: false,
    });
    practice.sessionTotals.mockResolvedValue({ sessions: 3, trades: 6 });
    practice.sessionTrades.mockResolvedValue([
      {
        id: 't1',
        side: 'long',
        orderType: 'limit',
        orderPrice: 50000,
        quantity: 0.01,
        entryPrice: 50000,
        entryTime: 1_620_000_000,
        stopLoss: 49000,
        takeProfit: null,
        status: 'closed',
        exitPrice: 52500,
        exitTime: 1_620_003_600,
        exitReason: 'takeProfit',
        pnl: 25,
      },
      {
        id: 't2',
        side: 'short',
        orderType: 'stop',
        orderPrice: 100,
        quantity: 1,
        entryPrice: 100,
        entryTime: 1_620_000_000,
        stopLoss: null,
        takeProfit: null,
        status: 'pending',
      },
    ]);
  });

  const sessionRows = () => [...el.querySelectorAll('table.sessions > tbody > tr:not(.detail)')];
  const button = (row: Element, name: string) =>
    [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  const chart = () =>
    fixture.debugElement.query((d) => d.componentInstance instanceof FakeChart)
      ?.componentInstance as FakeChart | undefined;

  const select = (label: string) =>
    [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.trim().startsWith(label))!
      .querySelector<HTMLInputElement | HTMLSelectElement>('select, input')!;
  const change = async (field: HTMLInputElement | HTMLSelectElement, value: string) => {
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };

  it('lists the first page of sessions with totals for the filters', async () => {
    await render();
    expect(practice.sessionsPage).toHaveBeenCalledWith({}, REVIEW_PAGE_SIZE, undefined);
    expect(practice.sessionTotals).toHaveBeenCalledWith({});
    expect([...el.querySelectorAll('.stat strong')].map((s) => s.textContent)).toEqual(['3', '6']);
    expect(sessionRows()).toHaveLength(3);
    // Dates follow the site's language (Spanish by default).
    expect(el.textContent).toContain('10 may 2021');
    // A single page needs no pager.
    expect(el.querySelector('.pager')).toBeNull();
  });

  it('queries again with the student, type, status and dates picked', async () => {
    await render();
    expect([...select('Estudiante').querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Todos los estudiantes',
      'Ana',
      'Luis',
    ]);
    await change(select('Estudiante'), 'luis');
    expect(practice.sessionsPage).toHaveBeenLastCalledWith(
      { uid: 'luis' },
      REVIEW_PAGE_SIZE,
      undefined,
    );
    await change(select('Tipo'), 'e1');
    await change(select('Estado'), 'finished');
    await change(select('Desde'), '2026-10-01');
    await change(select('Hasta'), '2026-10-20');
    const filters = {
      uid: 'luis',
      evaluationId: 'e1',
      status: 'finished',
      from: new Date(2026, 9, 1),
      // The whole last day counts.
      to: new Date(2026, 9, 21),
    };
    expect(practice.sessionsPage).toHaveBeenLastCalledWith(filters, REVIEW_PAGE_SIZE, undefined);
    expect(practice.sessionTotals).toHaveBeenLastCalledWith(filters);

    await change(select('Tipo'), 'free');
    expect(practice.sessionsPage.mock.lastCall![0].evaluationId).toBeNull();

    practice.sessionsPage.mockResolvedValue({ items: [], last: undefined, hasMore: false });
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Limpiar filtros')!
      .click();
    await fixture.whenStable();
    expect(practice.sessionsPage).toHaveBeenLastCalledWith({}, REVIEW_PAGE_SIZE, undefined);
    expect(el.textContent).toContain('No hay prácticas registradas.');
  });

  it('pages forward with the cursor and back to the first page', async () => {
    practice.sessionsPage.mockResolvedValueOnce({
      items: [session('s1', 'ana', 'Ana', 'PAXGUSDT', 25)],
      last: 'cursor-1',
      hasMore: true,
    });
    await render();
    const pager = () => el.querySelector('.pager')!;
    expect(pager().textContent).toContain('Página 1');
    const [previous, next] = [...pager().querySelectorAll('button')];
    expect(previous.disabled).toBe(true);

    practice.sessionsPage.mockResolvedValueOnce({
      items: [session('s9', 'luis', 'Luis', 'XAUUSDT', 3)],
      last: 'cursor-2',
      hasMore: false,
    });
    next.click();
    await fixture.whenStable();
    expect(practice.sessionsPage).toHaveBeenLastCalledWith({}, REVIEW_PAGE_SIZE, 'cursor-1');
    expect(pager().textContent).toContain('Página 2');
    expect(sessionRows()[0].textContent).toContain('Luis');
    expect(pager().querySelectorAll('button')[1].disabled).toBe(true);

    pager().querySelector('button')!.click();
    await fixture.whenStable();
    expect(practice.sessionsPage).toHaveBeenLastCalledWith({}, REVIEW_PAGE_SIZE, undefined);
  });

  it("shows a session's chart and trades on demand", async () => {
    await render();
    button(sessionRows()[0], 'Ver práctica').click();
    await fixture.whenStable();
    expect(practice.sessionTrades).toHaveBeenCalledWith('s1');
    // The same window the student saw: HISTORY_BARS hourly candles before the replay, then it.
    const replayStart = Date.UTC(2021, 4, 10);
    expect(market.loadHistory).toHaveBeenCalledWith('PAXGUSDT', '1h', replayStart, HISTORY_BARS);
    expect(market.loadCandles).toHaveBeenCalledWith('PAXGUSDT', '1h', replayStart);
    expect(chart()?.candles()).toEqual([candle, later]);
    expect(chart()?.trades()).toHaveLength(2);
    expect(el.querySelector('app-session-stats')?.textContent).toContain('Drawdown máximo');
    expect(chart()?.barSeconds()).toBe(3600);
    const detail = el.querySelector('.detail')!;
    expect(detail.textContent).toContain('Take profit');
    expect(detail.textContent).toContain('52,500.00');
    expect(detail.textContent).toContain('Compra límite');
    expect(detail.textContent).toContain('Venta stop');
    expect(detail.textContent).toContain('Orden pendiente');
    // The filled trade is picked and the chart scrolls to it; the pending order is not a step.
    expect(chart()?.focusTrade()).toBe('t1');
    expect(detail.querySelector('app-trade-navigator')?.textContent).toContain('Operación 1 de 1');

    button(sessionRows()[0], 'Ocultar').click();
    await fixture.whenStable();
    expect(el.querySelector('.detail')).toBeNull();
  });

  it('still lists the trades when the chart cannot load', async () => {
    market.loadCandles.mockRejectedValue(new Error('HTTP 451'));
    await render();
    button(sessionRows()[0], 'Ver práctica').click();
    await fixture.whenStable();
    expect(chart()).toBeUndefined();
    expect(el.textContent).toContain('No se pudo cargar el gráfico del mercado.');
    expect(el.querySelector('.detail')!.textContent).toContain('Take profit');
  });

  it('deletes a session after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    await render();
    button(sessionRows()[0], 'Eliminar').click();
    await fixture.whenStable();
    expect(practice.deleteSession).not.toHaveBeenCalled();

    button(sessionRows()[0], 'Eliminar').click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('práctica de Ana'));
    expect(practice.deleteSession).toHaveBeenCalledWith('s1');
    expect(sessionRows()).toHaveLength(2);
    expect(el.querySelector('.stat strong')!.textContent).toBe('2');

    practice.deleteSession.mockRejectedValue(new Error('denied'));
    button(sessionRows()[0], 'Eliminar').click();
    await fixture.whenStable();
    expect(sessionRows()).toHaveLength(2);
    expect(el.textContent).toContain('No se pudo eliminar la práctica.');
  });

  it('explains when the sessions cannot load', async () => {
    practice.sessionsPage.mockRejectedValue(new Error('denied'));
    practice.sessionTotals.mockRejectedValue(new Error('denied'));
    await render();
    expect(el.textContent).toContain('No se pudieron cargar las prácticas.');
  });
});
