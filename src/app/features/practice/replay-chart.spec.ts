import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Candle, PracticeTrade } from '../../core/models/practice';
import { LevelMove, LevelRemove, OrderDraft, ReplayChart } from './replay-chart';

const lw = vi.hoisted(() => {
  const makeSeries = () => ({
    setData: vi.fn(),
    update: vi.fn(),
    createPriceLine: vi.fn((options) => ({ ...options, applyOptions: vi.fn() })),
    // y = 500 - price, so prices and pixels are easy to reason about.
    priceToCoordinate: vi.fn((price: number) => 500 - price),
    coordinateToPrice: vi.fn((y: number) => 500 - y),
    removePriceLine: vi.fn(),
  });
  const series = makeSeries();
  const lines: ReturnType<typeof makeSeries>[] = [];
  const timeScale = {
    scrollToRealTime: vi.fn(),
    subscribeVisibleLogicalRangeChange: vi.fn(),
    subscribeSizeChange: vi.fn(),
  };
  const pane = { setHeight: vi.fn() };
  const handlers: { click?: (param: unknown) => void } = {};
  const chart = {
    addSeries: vi.fn((type: string) => {
      if (type === 'Candlestick') {
        return series;
      }
      const line = makeSeries();
      lines.push(line);
      return line;
    }),
    removeSeries: vi.fn(),
    applyOptions: vi.fn(),
    timeScale: () => timeScale,
    priceScale: () => ({ width: () => 60 }),
    panes: () => [pane, pane],
    subscribeCrosshairMove: vi.fn(),
    subscribeClick: vi.fn((handler) => (handlers.click = handler)),
    remove: vi.fn(),
  };
  const markers = { setMarkers: vi.fn() };
  return { series, lines, chart, markers, pane, handlers };
});

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'Candlestick',
  LineSeries: 'Line',
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  createChart: vi.fn(() => lw.chart),
  createSeriesMarkers: vi.fn(() => lw.markers),
}));

const c = (time: number, close = 1.5): Candle => ({ time, open: 1, high: 2, low: 0.5, close });

const position: PracticeTrade = {
  id: 'a',
  uid: 'u',
  side: 'long',
  orderType: 'market',
  orderPrice: null,
  placedTime: 1,
  quantity: 5,
  entryPrice: 120,
  entryTime: 1,
  stopLoss: 110,
  takeProfit: null,
  status: 'open',
};

@Component({
  imports: [ReplayChart],
  template: `<app-replay-chart
    [candles]="candles()"
    [trades]="trades()"
    [draft]="draft()"
    [hideDates]="hide()"
    [barSeconds]="barSeconds()"
    (levelMoved)="moves.push($event)"
    (levelRemoved)="removed.push($event)"
    (tradeClosed)="closed.push($event)"
  />`,
})
class Host {
  readonly candles = signal([c(1), c(2)]);
  readonly trades = signal<PracticeTrade[]>([]);
  readonly draft = signal<OrderDraft | null>(null);
  readonly hide = signal(true);
  readonly barSeconds = signal(1);
  readonly moves: LevelMove[] = [];
  readonly removed: LevelRemove[] = [];
  readonly closed: string[] = [];
}

describe('ReplayChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lw.lines.length = 0;
  });

  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const button = (name: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
    const click = async (name: string) => {
      button(name).click();
      await fixture.whenStable();
    };
    const labels = () =>
      [...el.querySelectorAll<HTMLElement>('.line-label')].map((l) =>
        l.textContent!.replace(/\s+/g, ' ').trim(),
      );
    return { fixture, el, host: fixture.componentInstance, button, click, labels };
  };

  it('draws the candles, updates the forming one, appends the next one and redraws otherwise', async () => {
    const { fixture, host } = await render();
    expect(lw.series.setData).toHaveBeenCalledWith([c(1), c(2)]);

    // The last candle grows (a new minute of the forming bar)...
    const first = host.candles()[0];
    host.candles.set([first, c(2, 1.7)]);
    await fixture.whenStable();
    expect(lw.series.update).toHaveBeenLastCalledWith(c(2, 1.7));
    // ...then completes and a new one starts.
    host.candles.set([first, c(2, 1.8), c(3)]);
    await fixture.whenStable();
    expect(lw.series.update.mock.calls.slice(-2)).toEqual([[c(2, 1.8)], [c(3)]]);
    expect(lw.series.setData).toHaveBeenCalledTimes(1);

    host.candles.set([c(10)]);
    await fixture.whenStable();
    expect(lw.series.setData).toHaveBeenLastCalledWith([c(10)]);

    fixture.destroy();
    expect(lw.chart.remove).toHaveBeenCalled();
  });

  it('hides dates while asked to', async () => {
    const { fixture, host } = await render();
    const hidden = lw.chart.applyOptions.mock.calls.at(-1)![0];
    expect(hidden.localization.timeFormatter()).toBe('');

    host.hide.set(false);
    await fixture.whenStable();
    expect(lw.chart.applyOptions.mock.calls.at(-1)![0].localization.timeFormatter).toBeUndefined();
  });

  it('marks entries and exits on their bar and labels positions with size and live P/L', async () => {
    const { fixture, host, labels } = await render();
    host.barSeconds.set(2);
    host.trades.set([
      position,
      {
        ...position,
        id: 'b',
        side: 'short',
        stopLoss: null,
        status: 'closed',
        entryTime: 2,
        exitTime: 3,
        exitPrice: 90,
        pnl: 10,
      },
    ]);
    await fixture.whenStable();

    const markers = lw.markers.setMarkers.mock.calls.at(-1)![0];
    expect(markers.map((m: { time: number; text: string }) => [m.time, m.text])).toEqual([
      [0, 'Compra'],
      [2, 'Venta'],
      [2, '+10.00'],
    ]);
    expect(lw.series.createPriceLine).toHaveBeenCalledTimes(2);
    // 0.05 lots bought at 120, last close 1.5; stop loss at 110.
    expect(labels()).toEqual(['Compra 0.05 -592.50 USD ×', 'SL -50.00 USD ×']);

    // A new candle refreshes the position's P/L.
    host.candles.update((list) => [...list, c(3, 130)]);
    await fixture.whenStable();
    expect(labels()[0]).toBe('Compra 0.05 +50.00 USD ×');

    host.trades.set([]);
    await fixture.whenStable();
    expect(lw.series.removePriceLine).toHaveBeenCalledTimes(2);
    expect(labels()).toEqual([]);
  });

  it('closes positions and removes levels from the × of their labels', async () => {
    const { fixture, host, el } = await render();
    host.trades.set([position]);
    host.draft.set({
      side: 'long',
      orderType: 'market',
      price: null,
      stopLoss: 1,
      takeProfit: null,
    });
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('button[aria-label="Cerrar posición"]')!.click();
    el.querySelectorAll<HTMLButtonElement>('button[aria-label="Quitar stop loss"]').forEach((b) =>
      b.click(),
    );
    expect(host.closed).toEqual(['a']);
    expect(host.removed).toEqual([
      { target: 'a', field: 'stopLoss' },
      { target: 'draft', field: 'stopLoss' },
    ]);
  });

  it('lets the student drag the draft and trade levels, not the entry of an open trade', async () => {
    const { fixture, host, el } = await render();
    host.draft.set({ side: 'long', orderType: 'limit', price: 98, stopLoss: 95, takeProfit: null });
    host.trades.set([position]);
    await fixture.whenStable();
    const canvas = el.querySelector('.canvas')!;
    const pointer = (type: string, clientY: number) =>
      canvas.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));

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

    // A label is a handle for its line too.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    const label = [...el.querySelectorAll('.line-label')].find((l) =>
      l.textContent?.includes('Nueva compra límite'),
    )!;
    label.dispatchEvent(new MouseEvent('pointerdown', { clientY: 402, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientY: 403, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('pointerup', { clientY: 403, bubbles: true }));
    expect(host.moves.at(-1)).toEqual({ target: 'draft', field: 'price', price: 97 });
  });

  it('switches indicators on and off, with the RSI in its own pane', async () => {
    const { fixture, host, click } = await render();
    host.candles.set(Array.from({ length: 30 }, (_, i) => c(i + 1, 100 + i)));
    await fixture.whenStable();

    await click('MA 20');
    expect(lw.chart.addSeries).toHaveBeenLastCalledWith('Line', expect.anything(), 0);
    const ma = lw.lines[0];
    // 30 closes: 11 values of the 20-candle average, the first one 109.5.
    expect(ma.setData.mock.calls.at(-1)![0]).toHaveLength(11);
    expect(ma.setData.mock.calls.at(-1)![0][0]).toEqual({ time: 20, value: 109.5 });

    await click('RSI 14');
    expect(lw.chart.addSeries).toHaveBeenLastCalledWith('Line', expect.anything(), 1);
    expect(lw.pane.setHeight).toHaveBeenCalled();
    expect(lw.lines[1].createPriceLine).toHaveBeenCalledTimes(2);

    await click('MA 20');
    expect(lw.chart.removeSeries).toHaveBeenCalledWith(ma);
  });

  it('draws horizontal and trend lines where the student clicks, and erases them', async () => {
    const { fixture, click, labels, button, el } = await render();
    const chartClick = async (time: number | undefined, y: number) => {
      lw.handlers.click!({ time, point: { x: 10, y }, paneIndex: 0 });
      await fixture.whenStable();
    };

    await click('Línea horizontal');
    expect(el.textContent).toContain('Haz clic en el gráfico para poner la línea.');
    await chartClick(1, 400);
    expect(lw.series.createPriceLine).toHaveBeenLastCalledWith(
      expect.objectContaining({ price: 100 }),
    );
    expect(labels()).toEqual(['×']);

    await click('Línea de tendencia');
    await chartClick(2, 390);
    expect(el.textContent).toContain('Haz clic en el segundo punto.');
    await chartClick(1, 380);
    expect(lw.lines[0].setData).toHaveBeenCalledWith([
      { time: 1, value: 120 },
      { time: 2, value: 110 },
    ]);
    expect(button('Línea de tendencia').getAttribute('aria-pressed')).toBe('false');

    el.querySelector<HTMLButtonElement>('button[aria-label="Borrar línea"]')!.click();
    await fixture.whenStable();
    expect(labels()).toEqual([]);
    await click('Borrar dibujos');
    expect(lw.chart.removeSeries).toHaveBeenCalledWith(lw.lines[0]);
    expect(button('Borrar dibujos').disabled).toBe(true);
  });
});
