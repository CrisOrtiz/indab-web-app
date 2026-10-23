import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Candle, PracticeTrade } from '../../core/models/practice';
import { LevelMove, LevelRemove, OrderAt, OrderDraft, ReplayChart } from './replay-chart';

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
    // Bar i sits at x = 10 * i, in a 700 px wide pane.
    logicalToCoordinate: vi.fn((index: number) => index * 10),
    coordinateToLogical: vi.fn((x: number) => x / 10),
    width: () => 700,
  };
  const pane = { setHeight: vi.fn(), getHeight: () => 420 };
  const priceScale = { width: () => 60, applyOptions: vi.fn() };
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
    priceScale: () => priceScale,
    panes: () => [pane, pane],
    subscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
  };
  const markers = { setMarkers: vi.fn() };
  return { series, lines, chart, markers, pane, priceScale };
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
    (draftSubmitted)="submitted()"
    (orderAt)="orders.push($event)"
    (lotsChanged)="lots.push($event)"
    symbol="PAXGUSDT"
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
  readonly orders: OrderAt[] = [];
  readonly lots: string[] = [];
  submitted = () => {};
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

    // Other bars (another timeframe) are drawn from scratch with the price range fitted again.
    lw.priceScale.applyOptions.mockClear();
    host.candles.set([c(10)]);
    await fixture.whenStable();
    expect(lw.series.setData).toHaveBeenLastCalledWith([c(10)]);
    expect(lw.priceScale.applyOptions).toHaveBeenCalledWith({ autoScale: true });

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
    expect(labels()).toEqual(['Compra 0.05 -592.50 USD ×', 'SL 0.05 -50.00 USD ×']);

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

  it('lets the student drag the draft and trade levels', async () => {
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

    // The open trade's stop loss (y = 390) moves; a click on its entry (y = 380) adds nothing.
    pointer('pointerdown', 390);
    pointer('pointermove', 392);
    pointer('pointerup', 392);
    pointer('pointerdown', 380);
    pointer('pointerup', 370);
    expect(host.moves.slice(1)).toEqual([{ target: 'a', field: 'stopLoss', price: 108 }]);

    // On a touch screen, a finger dragging a line neither scrolls the page nor pans the chart.
    const touch = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(touch('touchmove')).toBe(false);
    pointer('pointerdown', 390);
    expect(touch('touchstart')).toBe(true);
    expect(touch('touchmove')).toBe(true);
    pointer('pointerup', 390);
    host.moves.pop();

    // A label is a handle for its line too.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    const label = [...el.querySelectorAll('.line-label')].find((l) =>
      l.textContent?.includes('Límite'),
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
    const chartClick = async (time: number, y: number) => {
      // Bar `time` (1 or 2) is at x 0 or 10.
      el.querySelector('.canvas')!.dispatchEvent(
        new MouseEvent('click', { clientX: (time - 1) * 10, clientY: y, bubbles: true }),
      );
      await fixture.whenStable();
    };

    await click('Horizontal');
    expect(el.textContent).toContain('Haz clic en el gráfico para poner la línea.');
    // Clicks on the price scale or the RSI pane do not draw.
    await chartClick(80, 400);
    await chartClick(1, 450);
    expect(lw.series.createPriceLine).not.toHaveBeenCalled();
    await chartClick(1, 400);
    expect(lw.series.createPriceLine).toHaveBeenLastCalledWith(
      expect.objectContaining({ price: 100 }),
    );
    expect(labels()).toEqual(['×']);

    await click('Tendencia');
    await chartClick(2, 390);
    expect(el.textContent).toContain('Haz clic en el segundo punto.');
    await chartClick(1, 380);
    expect(lw.lines[0].setData).toHaveBeenCalledWith([
      { time: 1, value: 120 },
      { time: 2, value: 110 },
    ]);
    expect(button('Tendencia').getAttribute('aria-pressed')).toBe('false');

    el.querySelector<HTMLButtonElement>('button[aria-label="Borrar línea"]')!.click();
    await fixture.whenStable();
    expect(labels()).toEqual([]);
    await click('Borrar dibujos');
    expect(lw.chart.removeSeries).toHaveBeenCalledWith(lw.lines[0]);
    expect(button('Borrar dibujos').disabled).toBe(true);
  });

  it('draws rectangles and Fibonacci retracements over the chart, and erases them', async () => {
    const { fixture, click, el } = await render();
    const chartClick = async (time: number, y: number) => {
      // Bar `time` (1 or 2) is at x 0 or 10.
      el.querySelector('.canvas')!.dispatchEvent(
        new MouseEvent('click', { clientX: (time - 1) * 10, clientY: y, bubbles: true }),
      );
      await fixture.whenStable();
    };

    await click('Rectángulo');
    expect(el.textContent).toContain('Haz clic en una esquina del rectángulo.');
    await chartClick(2, 300);
    expect(el.textContent).toContain('Haz clic en la esquina opuesta.');
    await chartClick(1, 380);
    const rect = el.querySelector('svg.shapes rect')!;
    // Bars 1 and 2 are at x 0 and 10; prices 120 and 200 at y 380 and 300.
    expect(['x', 'y', 'width', 'height'].map((a) => rect.getAttribute(a))).toEqual([
      '0',
      '300',
      '10',
      '80',
    ]);

    // A move from 100 up to 200: the 0 level sits at its end and 1 at its start.
    await click('Fibonacci');
    await chartClick(1, 400);
    await chartClick(2, 300);
    const levels = [...el.querySelectorAll('svg.shapes .fib-text')].map((t) =>
      t.textContent!.trim(),
    );
    expect(levels).toEqual([
      '0 (200.000)',
      '0.236 (176.400)',
      '0.382 (161.800)',
      '0.5 (150.000)',
      '0.618 (138.200)',
      '0.786 (121.400)',
      '1 (100.000)',
    ]);

    el.querySelector<HTMLButtonElement>('button[aria-label="Borrar rectángulo"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('svg.shapes rect')).toBeNull();
    expect(el.querySelectorAll('svg.shapes .fib')).toHaveLength(7);
    await click('Borrar dibujos');
    expect(el.querySelector('svg.shapes')).toBeNull();
  });

  it('pulls a take profit or stop loss out of an entry line, as in TradingView', async () => {
    const { fixture, host, el, labels } = await render();
    // A market order being set up sits on the last close (1.5, y = 498.5).
    host.draft.set({
      side: 'short',
      orderType: 'market',
      price: null,
      stopLoss: null,
      takeProfit: null,
      quantity: 5,
    });
    host.trades.set([position]);
    await fixture.whenStable();
    expect(labels()).toContain('Vender Mercado');
    const lots = el.querySelector<HTMLInputElement>('.line-label input.lots')!;
    expect(lots.value).toBe('0.05');
    lots.value = '0.1';
    lots.dispatchEvent(new Event('change'));
    expect(host.lots).toEqual(['0.1']);
    const canvas = el.querySelector('.canvas')!;
    const pointer = (type: string, clientY: number) =>
      canvas.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));

    // From the long position's entry (120, y = 380): up is a take profit, with its P/L live.
    pointer('pointerdown', 380);
    pointer('pointermove', 360);
    await fixture.whenStable();
    expect(labels()).toContain('TP 0.05 +100.00 USD ×');
    pointer('pointerup', 360);
    // ...and down a stop loss.
    pointer('pointerdown', 380);
    pointer('pointermove', 400);
    pointer('pointerup', 400);
    // For the short order being set up, down is its take profit.
    pointer('pointerdown', 498);
    pointer('pointermove', 499);
    pointer('pointerup', 499);
    expect(host.moves).toEqual([
      { target: 'a', field: 'takeProfit', price: 140 },
      { target: 'a', field: 'stopLoss', price: 100 },
      { target: 'draft', field: 'takeProfit', price: 1 },
    ]);

    // The side button on the order line places it.
    let submitted = 0;
    fixture.componentInstance.submitted = () => submitted++;
    el.querySelector<HTMLButtonElement>('.line-label button.badge')!.click();
    expect(submitted).toBe(1);
  });

  it('offers orders and a horizontal line at the price under the pointer', async () => {
    const { fixture, host, el, labels } = await render();
    host.candles.set([c(1), c(2, 100)]);
    host.draft.set({
      side: 'long',
      orderType: 'market',
      price: null,
      stopLoss: null,
      takeProfit: null,
      quantity: 5,
    });
    await fixture.whenStable();
    const stage = el.querySelector('.stage')!;
    // y = 410 is price 90, below the market (100).
    stage.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 50, clientY: 410, bubbles: true }),
    );
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('button.plus')!.click();
    await fixture.whenStable();
    const items = () =>
      [...el.querySelectorAll<HTMLButtonElement>('.plus-menu button')].map((b) =>
        b.textContent!.replace(/\s+/g, ' ').trim(),
      );
    expect(items()).toEqual([
      'Comprar 0.05 PAXGUSDT @ 90.000 límite',
      'Vender 0.05 PAXGUSDT @ 90.000 stop',
      'Añadir orden en 90.000…',
      'Dibujar línea horizontal en 90.000',
    ]);
    el.querySelectorAll<HTMLButtonElement>('.plus-menu button')[1].click();
    await fixture.whenStable();
    expect(el.querySelector('.plus-menu')).toBeNull();

    el.querySelector<HTMLButtonElement>('button.plus')!.click();
    await fixture.whenStable();
    el.querySelectorAll<HTMLButtonElement>('.plus-menu button')[2].click();
    el.querySelector<HTMLButtonElement>('button.plus')!.click();
    await fixture.whenStable();
    el.querySelectorAll<HTMLButtonElement>('.plus-menu button')[3].click();
    await fixture.whenStable();
    expect(host.orders).toEqual([
      { side: 'short', orderType: 'stop', price: 90, place: true },
      { side: 'long', orderType: 'limit', price: 90, place: false },
    ]);
    expect(labels()).toContain('×');

    // Clicking elsewhere closes the menu; outside the candles there is no "+".
    el.querySelector<HTMLButtonElement>('button.plus')!.click();
    await fixture.whenStable();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector('.plus-menu')).toBeNull();
    stage.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 750, clientY: 410, bubbles: true }),
    );
    await fixture.whenStable();
    expect(el.querySelector('button.plus')).toBeNull();
  });
});
