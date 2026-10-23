import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Candle, PracticeTrade } from '../../core/models/practice';
import { LevelMove, OrderDraft, ReplayChart } from './replay-chart';

const lw = vi.hoisted(() => {
  const series = {
    setData: vi.fn(),
    update: vi.fn(),
    createPriceLine: vi.fn((options) => ({ ...options, applyOptions: vi.fn() })),
    // y = 500 - price, so prices and pixels are easy to reason about.
    priceToCoordinate: vi.fn((price: number) => 500 - price),
    coordinateToPrice: vi.fn((y: number) => 500 - y),
    removePriceLine: vi.fn(),
  };
  const timeScale = { scrollToRealTime: vi.fn() };
  const chart = {
    addSeries: vi.fn(() => series),
    applyOptions: vi.fn(),
    timeScale: () => timeScale,
    remove: vi.fn(),
  };
  const markers = { setMarkers: vi.fn() };
  return { series, chart, markers };
});

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'Candlestick',
  LineStyle: { Dashed: 2 },
  createChart: vi.fn(() => lw.chart),
  createSeriesMarkers: vi.fn(() => lw.markers),
}));

const c = (time: number): Candle => ({ time, open: 1, high: 2, low: 0.5, close: 1.5 });

@Component({
  imports: [ReplayChart],
  template: `<app-replay-chart
    [candles]="candles()"
    [trades]="trades()"
    [draft]="draft()"
    [hideDates]="hide()"
    (levelMoved)="moves.push($event)"
  />`,
})
class Host {
  readonly candles = signal([c(1), c(2)]);
  readonly trades = signal<PracticeTrade[]>([]);
  readonly draft = signal<OrderDraft | null>(null);
  readonly hide = signal(true);
  readonly moves: LevelMove[] = [];
}

describe('ReplayChart', () => {
  beforeEach(() => vi.clearAllMocks());

  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  };

  it('draws the candles, appends the next one and redraws on a new series', async () => {
    const fixture = await render();
    const host = fixture.componentInstance;
    expect(lw.series.setData).toHaveBeenCalledWith([c(1), c(2)]);

    host.candles.update((list) => [...list, c(3)]);
    await fixture.whenStable();
    expect(lw.series.update).toHaveBeenCalledWith(c(3));

    host.candles.set([c(10)]);
    await fixture.whenStable();
    expect(lw.series.setData).toHaveBeenLastCalledWith([c(10)]);

    fixture.destroy();
    expect(lw.chart.remove).toHaveBeenCalled();
  });

  it('hides dates while asked to', async () => {
    const fixture = await render();
    const hidden = lw.chart.applyOptions.mock.calls.at(-1)![0];
    expect(hidden.localization.timeFormatter()).toBe('');

    fixture.componentInstance.hide.set(false);
    await fixture.whenStable();
    expect(lw.chart.applyOptions.mock.calls.at(-1)![0].localization.timeFormatter).toBeUndefined();
  });

  it('marks entries and exits and draws lines for open trades', async () => {
    const fixture = await render();
    const base = {
      uid: 'u',
      quantity: 1,
      entryPrice: 100,
      takeProfit: null,
      orderType: 'market',
      orderPrice: null,
      placedTime: 1,
    } as const;
    fixture.componentInstance.trades.set([
      { ...base, id: 'a', side: 'long', entryTime: 1, stopLoss: 95, status: 'open' },
      {
        ...base,
        id: 'b',
        side: 'short',
        entryTime: 1,
        stopLoss: null,
        status: 'closed',
        exitTime: 2,
        exitPrice: 90,
        pnl: 10,
      },
    ]);
    await fixture.whenStable();

    const markers = lw.markers.setMarkers.mock.calls.at(-1)![0];
    expect(markers.map((m: { text: string }) => m.text)).toEqual(['Compra', 'Venta', '+10.00']);
    const lines = lw.series.createPriceLine.mock.calls.map(([line]) => line.title);
    expect(lines).toEqual(['Compra', 'SL']);

    fixture.componentInstance.trades.set([]);
    await fixture.whenStable();
    expect(lw.series.removePriceLine).toHaveBeenCalledTimes(2);
  });

  it('lets the student drag the draft and trade levels, not the entry of an open trade', async () => {
    const fixture = await render();
    const host = fixture.componentInstance;
    host.draft.set({ side: 'long', orderType: 'limit', price: 98, stopLoss: 95, takeProfit: null });
    host.trades.set([
      {
        id: 'a',
        uid: 'u',
        side: 'long',
        orderType: 'market',
        orderPrice: null,
        placedTime: 1,
        quantity: 1,
        entryPrice: 120,
        entryTime: 1,
        stopLoss: 110,
        takeProfit: null,
        status: 'open',
      },
    ]);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement.querySelector('app-replay-chart');
    const pointer = (type: string, clientY: number) =>
      el.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));

    // The stop loss of the draft sits at y = 405: grab it and drop it at 410 (price 90).
    pointer('pointerdown', 406);
    expect(lw.chart.applyOptions).toHaveBeenLastCalledWith({
      handleScroll: false,
      handleScale: false,
    });
    pointer('pointermove', 410);
    pointer('pointerup', 410);
    expect(host.moves).toEqual([{ target: 'draft', field: 'stopLoss', price: 90 }]);
    expect(lw.chart.applyOptions).toHaveBeenLastCalledWith({
      handleScroll: true,
      handleScale: true,
    });

    // The open trade's stop loss (y = 390) moves; its entry line (y = 380) does not.
    pointer('pointerdown', 390);
    pointer('pointermove', 392);
    pointer('pointerup', 392);
    pointer('pointerdown', 380);
    pointer('pointerup', 370);
    expect(host.moves.slice(1)).toEqual([{ target: 'a', field: 'stopLoss', price: 108 }]);
  });
});
