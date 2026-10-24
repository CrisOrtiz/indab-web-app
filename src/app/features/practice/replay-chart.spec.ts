import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Candle, OrderType, PracticeTrade } from '../../core/models/practice';
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
    [trading]="trading()"
    [lots]="0.05"
    (levelMoved)="moves.push($event)"
    (levelRemoved)="removed.push($event)"
    (levelAdded)="added.push($event)"
    (tradeClosed)="closed.push($event)"
    (draftSubmitted)="submitted()"
    (draftDiscarded)="discarded = discarded + 1"
    (draftTypeChanged)="types.push($event)"
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
  readonly trading = signal(true);
  readonly moves: LevelMove[] = [];
  readonly removed: LevelRemove[] = [];
  readonly added: LevelRemove[] = [];
  readonly types: OrderType[] = [];
  discarded = 0;
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
    // The position has no take profit yet: its TP tab hangs under the label.
    expect(labels()).toEqual(['Compra 0.05 -592.50 USD × TP', 'SL 0.05 -50.00 USD ×']);

    // A new candle refreshes the position's P/L.
    host.candles.update((list) => [...list, c(3, 130)]);
    await fixture.whenStable();
    expect(labels()[0]).toBe('Compra 0.05 +50.00 USD × TP');

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

  /** Drives drawings on the chart: menus, presses on the candles and the overlay. */
  const drawing = (r: Awaited<ReturnType<typeof render>>) => {
    const { fixture, el } = r;
    const canvas = el.querySelector('.canvas')!;
    const settle = () => fixture.whenStable();
    const openMenu = async (label: string) => {
      el.querySelector<HTMLButtonElement>(`.tools button[aria-label="${label}"]`)!.click();
      await settle();
    };
    const item = (name: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('.tool-menu button')].find(
        (b) => b.textContent!.replace('✓', '').trim() === name,
      )!;
    const pick = async (name: string) => {
      await openMenu('Herramientas de dibujo');
      item(name).click();
      await settle();
    };
    const pointer = (type: string, x: number, y: number, touch = false, target = canvas) => {
      const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: touch ? 'touch' : 'mouse' });
      target.dispatchEvent(event);
    };
    /** A press at (x, y), dragged to (toX, toY) if given. */
    const press = async (x: number, y: number, to?: [number, number], touch = false) => {
      pointer('pointerdown', x, y, touch);
      if (to) {
        pointer('pointermove', (x + to[0]) / 2, (y + to[1]) / 2, touch);
        pointer('pointermove', to[0], to[1], touch);
      }
      pointer('pointerup', ...(to ?? [x, y]), touch);
      await settle();
    };
    const rect = () => {
      const r = el.querySelector('svg.shapes rect');
      return r && ['x', 'y', 'width', 'height'].map((a) => Number(r.getAttribute(a)));
    };
    const handles = () => [...el.querySelectorAll<HTMLElement>('.handle')];
    const levels = () =>
      [...el.querySelectorAll('svg.shapes .fib-text')].map((t) => t.textContent!.trim());
    return { canvas, openMenu, item, pick, pointer, press, rect, handles, levels, settle };
  };

  it('switches indicators on and off from their menu, with the RSI in its own pane', async () => {
    const r = await render();
    const { fixture, host, el } = r;
    const { openMenu, item } = drawing(r);
    host.candles.set(Array.from({ length: 30 }, (_, i) => c(i + 1, 100 + i)));
    await fixture.whenStable();

    await openMenu('Indicadores');
    item('MA 20').click();
    await fixture.whenStable();
    expect(lw.chart.addSeries).toHaveBeenLastCalledWith('Line', expect.anything(), 0);
    const ma = lw.lines[0];
    // 30 closes: 11 values of the 20-candle average, the first one 109.5.
    expect(ma.setData.mock.calls.at(-1)![0]).toHaveLength(11);
    expect(ma.setData.mock.calls.at(-1)![0][0]).toEqual({ time: 20, value: 109.5 });
    expect(item('MA 20').getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('.menu-trigger .count')!.textContent).toBe('1');

    // The menu stays open to pick several.
    item('RSI 14').click();
    await fixture.whenStable();
    expect(lw.chart.addSeries).toHaveBeenLastCalledWith('Line', expect.anything(), 1);
    expect(lw.pane.setHeight).toHaveBeenCalled();
    expect(lw.lines[1].createPriceLine).toHaveBeenCalledTimes(2);

    item('MA 20').click();
    await fixture.whenStable();
    expect(lw.chart.removeSeries).toHaveBeenCalledWith(ma);

    // A press outside closes it.
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector('.tool-menu')).toBeNull();
  });

  it('draws horizontal and trend lines where the student clicks, and erases them', async () => {
    const r = await render();
    const { fixture, el, labels } = r;
    const { pick, press, pointer, openMenu, item, handles } = drawing(r);

    await pick('Línea horizontal');
    expect(el.textContent).toContain('Toca o haz clic donde va la línea.');
    // A tool keeps the chart from panning, so presses place points.
    expect(lw.chart.applyOptions).toHaveBeenLastCalledWith({
      handleScroll: false,
      handleScale: false,
    });
    expect(
      el.querySelector('.tools button[aria-label="Herramientas de dibujo"]')!.textContent,
    ).toContain('Línea horizontal');
    // Clicks on the price scale or the RSI pane do not draw.
    await press(800, 400);
    await press(0, 450);
    expect(lw.series.createPriceLine).not.toHaveBeenCalled();
    await press(0, 400);
    expect(lw.series.createPriceLine).toHaveBeenLastCalledWith(
      expect.objectContaining({ price: 100 }),
    );
    expect(labels()).toEqual(['×']);
    expect(lw.chart.applyOptions).toHaveBeenLastCalledWith({
      handleScroll: true,
      handleScale: true,
    });

    // Bars 1 and 2 are at x 0 and 10; the line follows the mouse until the second click.
    await pick('Línea de tendencia');
    await press(10, 390);
    expect(el.textContent).toContain('Marca el segundo punto.');
    pointer('pointermove', 0, 370);
    await fixture.whenStable();
    expect(el.querySelector('svg.shapes .trend')!.getAttribute('y2')).toBe('370');
    await press(0, 380);
    const line = el.querySelector('svg.shapes .trend')!;
    expect(['x1', 'y1', 'x2', 'y2'].map((a) => line.getAttribute(a))).toEqual([
      '0',
      '380',
      '10',
      '390',
    ]);
    // The new line is selected, with a handle at each end.
    expect(handles()).toHaveLength(2);
    expect(el.querySelector('.tool-hint')).toBeNull();

    el.querySelector<HTMLButtonElement>('button[aria-label="Borrar línea"]')!.click();
    await fixture.whenStable();
    expect(labels()).toEqual([]);
    await openMenu('Herramientas de dibujo');
    item('Borrar dibujos').click();
    await fixture.whenStable();
    expect(el.querySelector('svg.shapes')).toBeNull();
    await openMenu('Herramientas de dibujo');
    expect(item('Borrar dibujos').disabled).toBe(true);
  });

  it('draws rectangles by dragging and Fibonacci retracements by clicking', async () => {
    const r = await render();
    const { fixture, el } = r;
    const { pick, press, rect, levels } = drawing(r);

    await pick('Rectángulo');
    expect(el.textContent).toContain('Marca una esquina del rectángulo.');
    await press(10, 300, [0, 380]);
    // Prices 120 and 200 sit at y 380 and 300.
    expect(rect()).toEqual([0, 300, 10, 80]);

    // A move from 100 up to 200: the 0 level sits at its end and 1 at its start.
    await pick('Retroceso de Fibonacci');
    await press(0, 400);
    expect(el.textContent).toContain('Marca el final del movimiento.');
    await press(10, 300);
    expect(levels()).toEqual([
      '0 (200.000)',
      '0.236 (176.400)',
      '0.382 (161.800)',
      '0.5 (150.000)',
      '0.618 (138.200)',
      '0.786 (121.400)',
      '1 (100.000)',
    ]);

    // Escape puts a tool down halfway.
    await pick('Rectángulo');
    await press(0, 350);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(el.querySelector('.tool-hint')).toBeNull();
    expect(el.querySelectorAll('svg.shapes rect')).toHaveLength(1);
  });

  it('places points on a phone by dragging a crosshair, as in TradingView', async () => {
    const r = await render();
    const { fixture, el } = r;
    const { pick, press, pointer, levels, canvas } = drawing(r);

    await pick('Retroceso de Fibonacci');
    // The crosshair starts under the finger and moves as much as it does.
    pointer('pointerdown', 30, 300, true);
    await fixture.whenStable();
    expect(el.querySelectorAll('svg.shapes .crosshair')).toHaveLength(2);
    expect(el.querySelector('.cursor-price')!.textContent!.trim()).toBe('200.000');
    const touch = new Event('touchmove', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(touch);
    expect(touch.defaultPrevented).toBe(true);
    pointer('pointermove', 0, 200, true);
    pointer('pointerup', 0, 200, true);
    await fixture.whenStable();
    expect(el.querySelector('.cursor-price')!.textContent!.trim()).toBe('300.000');
    expect(el.textContent).toContain('Marca el final del movimiento.');

    // The second drag starts from the first point, wherever the finger lands.
    pointer('pointerdown', 200, 350, true);
    pointer('pointermove', 205, 400, true);
    pointer('pointermove', 210, 450, true);
    await fixture.whenStable();
    expect(el.querySelector('svg.shapes .anchor-dot')).not.toBeNull();
    pointer('pointerup', 210, 450, true);
    await fixture.whenStable();
    expect(levels()[0]).toBe('0 (200.000)');
    expect(levels().at(-1)).toBe('1 (300.000)');
    expect(el.querySelector('svg.shapes .crosshair')).toBeNull();

    // A tap puts the point where it lands.
    await pick('Línea horizontal');
    await press(5, 250, undefined, true);
    expect(lw.series.createPriceLine).toHaveBeenLastCalledWith(
      expect.objectContaining({ price: 250 }),
    );
  });

  it('selects a drawing to reshape, move, recolor or delete it', async () => {
    const r = await render();
    const { fixture, el } = r;
    const { pick, press, pointer, rect, handles } = drawing(r);
    await pick('Rectángulo');
    await press(0, 380, [10, 300]);
    expect(handles()).toHaveLength(8);

    // A tap elsewhere puts the selection down; a tap on the rectangle picks it again.
    await press(300, 100);
    expect(handles()).toHaveLength(0);
    expect(el.querySelector('.drawing-bar')).toBeNull();
    await press(5, 340, undefined, true);
    expect(handles()).toHaveLength(8);

    // The top right handle moves the top and the right side.
    const corner = handles().find((h) => h.style.left === '10px' && h.style.top === '300px')!;
    pointer('pointerdown', 10, 300, false, corner);
    pointer('pointermove', 10, 250);
    pointer('pointerup', 10, 250);
    await fixture.whenStable();
    expect(rect()).toEqual([0, 250, 10, 130]);

    // Dragging the body moves it whole, without panning the chart.
    pointer('pointerdown', 5, 320);
    expect(lw.chart.applyOptions).toHaveBeenLastCalledWith({
      handleScroll: false,
      handleScale: false,
    });
    pointer('pointermove', 5, 330);
    await fixture.whenStable();
    expect(rect()).toEqual([0, 260, 10, 130]);
    pointer('pointerup', 5, 330);
    await fixture.whenStable();
    expect(rect()).toEqual([0, 260, 10, 130]);

    el.querySelector<HTMLButtonElement>('button[aria-label="Color rojo"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('svg.shapes g')!.getAttribute('stroke')).toBe('#f23645');

    // Delete erases it, as the bar's trash button does.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    await fixture.whenStable();
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
    expect(labels()).toContain('Vender 0.05 Mercado × TP SL');
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
    // Nothing is placed from the menu: the page draws the order's line to adjust and place.
    expect(host.orders).toEqual([
      { side: 'short', orderType: 'stop', price: 90 },
      { side: 'long', orderType: 'limit', price: 90 },
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

    // On a phone a tap shows the "+", which stays when the finger lifts.
    const touch = (type: string, target: Element) => {
      // Away from the lines, which a tap would grab.
      const event = new MouseEvent(type, { clientX: 50, clientY: 300, bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      target.dispatchEvent(event);
    };
    touch('pointerdown', el.querySelector('.canvas')!);
    touch('pointerleave', stage);
    await fixture.whenStable();
    expect(el.querySelector<HTMLElement>('button.plus')!.style.top).toBe('300px');

    // A replay that is over (or the admin review) offers no "+".
    host.trading.set(false);
    await fixture.whenStable();
    stage.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 50, clientY: 410, bubbles: true }),
    );
    await fixture.whenStable();
    expect(el.querySelector('button.plus')).toBeNull();
  });

  it('sets up the order on its line: quantity pad, order type, warning and discard', async () => {
    const { fixture, host, el, labels } = await render();
    host.candles.set([c(1), c(2, 100)]);
    host.draft.set({
      side: 'long',
      orderType: 'stop',
      price: 110,
      stopLoss: null,
      takeProfit: null,
      quantity: 5,
    });
    await fixture.whenStable();
    expect(labels()).toEqual(['Comprar 0.05 Stop × TP SL']);
    const query = (selector: string) => el.querySelector<HTMLElement>(selector)!;

    // The lots open a quantity pad: typed, stepped or picked.
    query('button[aria-label="Lotes de la orden: 0.05"]').click();
    await fixture.whenStable();
    const pad = query('[role="dialog"][aria-label="Cantidad (lotes)"]');
    const input = pad.querySelector('input')!;
    expect(input.value).toBe('0.05');
    input.value = '0.2';
    input.dispatchEvent(new Event('change'));
    query('button[aria-label="Más lotes"]').click();
    query('button[aria-label="Menos lotes"]').click();
    [...pad.querySelectorAll('button')].find((b) => b.textContent?.trim() === '0.50')!.click();
    expect(host.lots).toEqual(['0.20', '0.06', '0.04', '0.50']);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    // The order type opens a menu.
    query('button[aria-label="Tipo de orden: Stop"]').click();
    await fixture.whenStable();
    const types = [...el.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(types.map((b) => [b.textContent!.trim(), b.getAttribute('aria-checked')])).toEqual([
      ['Mercado', 'false'],
      ['Límite', 'false'],
      ['Stop', 'true'],
    ]);
    types[1].click();
    await fixture.whenStable();
    expect(host.types).toEqual(['limit']);
    expect(el.querySelector('[role="menu"]')).toBeNull();

    // An order that cannot be placed says why, and its button is off.
    host.draft.update((d) => ({ ...d!, orderType: 'limit', error: 'Precio incorrecto' }));
    await fixture.whenStable();
    expect(query('[role="img"][aria-label="Precio incorrecto"]').textContent).toBe('!');
    expect(query('.line-label button.badge').hasAttribute('disabled')).toBe(true);

    // The × discards it.
    query('button[aria-label="Descartar orden"]').click();
    expect(host.discarded).toBe(1);
  });

  it('drags TP and SL out of their tabs, shades them, and drops them on the entry to remove', async () => {
    const { fixture, host, el, labels } = await render();
    host.candles.set([c(1), c(2, 100)]);
    host.draft.set({
      side: 'long',
      orderType: 'limit',
      price: 98,
      stopLoss: null,
      takeProfit: null,
      quantity: 5,
    });
    await fixture.whenStable();
    const canvas = el.querySelector('.canvas')!;
    const tab = (name: string) =>
      el.querySelector<HTMLElement>(`button.tab[aria-label="Añadir ${name}"]`)!;
    const grab = (name: string, clientY: number) =>
      tab(name).dispatchEvent(new MouseEvent('pointerdown', { clientY, bubbles: true }));
    const pointer = (type: string, clientY: number) =>
      canvas.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));

    // The entry is at 98 (y = 402). Pulling the TP tab up to 110 shows its band and P/L.
    grab('take profit', 402);
    pointer('pointermove', 390);
    await fixture.whenStable();
    expect(labels()).toContain('TP 0.05 +60.00 USD ×');
    const zone = el.querySelector<HTMLElement>('.zone.profit')!;
    expect([zone.style.top, zone.style.height]).toEqual(['390px', '12px']);
    pointer('pointerup', 390);
    // A click on the SL tab asks for it at its default distance.
    grab('stop loss', 402);
    pointer('pointerup', 402);
    expect(host.moves).toEqual([{ target: 'draft', field: 'takeProfit', price: 110 }]);
    expect(host.added).toEqual([{ target: 'draft', field: 'stopLoss' }]);

    // With a stop loss at 90 (y = 410) the band is red; dragging it back onto the entry
    // removes it.
    host.draft.update((d) => ({ ...d!, stopLoss: 90 }));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(el.querySelector('.zone.loss')).not.toBeNull();
    pointer('pointerdown', 410);
    pointer('pointermove', 403);
    pointer('pointerup', 403);
    expect(host.removed).toEqual([{ target: 'draft', field: 'stopLoss' }]);
    expect(host.moves).toHaveLength(1);
  });
});
