import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Candle } from '../../../core/models/practice';
import { HISTORY_BARS, MarketDataService } from '../../practice/market-data.service';
import { PracticeService } from '../../practice/practice.service';
import { ReplayChart } from '../../practice/replay-chart';
import { PracticeReview } from './practice-review';

// The real chart needs a canvas; the review only passes it data.
@Component({ selector: 'app-replay-chart', template: '' })
class FakeChart {
  readonly candles = input<Candle[]>([]);
  readonly trades = input<unknown[]>([]);
  readonly barSeconds = input(0);
}

const candle: Candle = { time: 1_620_000_000, open: 1, high: 2, low: 0.5, close: 1.5 };

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
  const practice = { allSessions: vi.fn(), sessionTrades: vi.fn(), deleteSession: vi.fn() };
  const market = { loadCandles: vi.fn() };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [PracticeReview],
      providers: [
        provideRouter([]),
        { provide: PracticeService, useValue: practice },
        { provide: MarketDataService, useValue: market },
      ],
    });
    TestBed.overrideComponent(PracticeReview, {
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
    market.loadCandles.mockResolvedValue([candle]);
    practice.deleteSession.mockResolvedValue(undefined);
    practice.allSessions.mockResolvedValue([
      session('s1', 'ana', 'Ana', 'PAXGUSDT', 25),
      session('s2', 'ana', 'Ana', 'BTCUSDT', -5),
      session('s3', 'luis', 'Luis', 'PAXGUSDT', 0),
    ]);
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

  it('lists every session with totals and a search', async () => {
    await render();
    expect([...el.querySelectorAll('.stat strong')].map((s) => s.textContent)).toEqual([
      '3',
      '2',
      '6',
    ]);
    expect(sessionRows()).toHaveLength(3);
    expect(el.textContent).toContain('10 May 2021');

    const search = el.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'luis';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(sessionRows()).toHaveLength(1);
  });

  it("shows a session's chart and trades on demand", async () => {
    await render();
    button(sessionRows()[0], 'Ver práctica').click();
    await fixture.whenStable();
    expect(practice.sessionTrades).toHaveBeenCalledWith('s1');
    // The same window the student saw: HISTORY_BARS hourly candles of history before the replay.
    expect(market.loadCandles).toHaveBeenCalledWith(
      'PAXGUSDT',
      '1h',
      Date.UTC(2021, 4, 10) - HISTORY_BARS * 3_600_000,
    );
    expect(chart()?.candles()).toEqual([candle]);
    expect(chart()?.trades()).toHaveLength(2);
    expect(chart()?.barSeconds()).toBe(3600);
    const detail = el.querySelector('.detail')!;
    expect(detail.textContent).toContain('Take profit');
    expect(detail.textContent).toContain('52,500.00');
    expect(detail.textContent).toContain('Compra límite');
    expect(detail.textContent).toContain('Venta stop');
    expect(detail.textContent).toContain('Orden pendiente');

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

    practice.deleteSession.mockRejectedValue(new Error('denied'));
    button(sessionRows()[0], 'Eliminar').click();
    await fixture.whenStable();
    expect(sessionRows()).toHaveLength(2);
    expect(el.textContent).toContain('No se pudo eliminar la práctica.');
  });

  it('explains when the sessions cannot load', async () => {
    practice.allSessions.mockRejectedValue(new Error('denied'));
    await render();
    expect(el.textContent).toContain('No se pudieron cargar las prácticas.');
  });
});
