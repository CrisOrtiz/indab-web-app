import { expect, test } from '@playwright/test';
import { createUser, listDocuments, resetEmulators } from './emulators';
import { nav, signIn, signOut } from './helpers';
import { mockMarket } from './market';

let studentUid: string;

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  await createUser('Ana Admin', 'admin@indab.test', { role: 'admin' });
  studentUid = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  await createUser('Luis Díaz', 'luis@indab.test');
  await mockMarket(page);
});

test('students without access cannot open the practice', async ({ page }) => {
  await signIn(page, 'luis@indab.test');
  await expect(page).toHaveURL('/academy');
  await page.goto('/academy/practice');
  await expect(page).toHaveURL('/academy');
});

test('a student practises on a replay and an admin reviews the trades', async ({ page }) => {
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await expect(page).toHaveURL('/academy/practice');
  await expect(page.getByText('Aún no has hecho ninguna práctica.')).toBeVisible();

  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await expect(page.locator('.market .price')).toHaveText('100.000');
  await expect(page.getByRole('contentinfo')).toContainText('Desarrollado por crisortizdev');

  // Buy 0.01 lots (1 oz) at 100 with a stop loss, then let two 15-minute candles pass.
  const lots = page.getByRole('spinbutton', { name: /Lotes \(tamaño/ });
  await lots.fill('0.01');
  await page.getByRole('switch', { name: 'Stop loss' }).check();
  await page.getByLabel('Precio del stop loss').fill('95');
  await expect(page.locator('.bracket .field')).toContainText('-5.00 USD');
  await page.getByRole('button', { name: 'Comprar 0.01 XAUUSDT MERCADO' }).click();
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente vela' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.market .price')).toHaveText('102.000');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Historial (1)' }).click();
  await expect(page.getByRole('cell', { name: 'Manual' })).toBeVisible();
  // The closed trade is drawn as a position box on the live chart.
  await expect(page.locator('.workspace .positions .position')).toHaveCount(1);

  // Sell 0.03 lots in one click from the chart and leave it open until the session ends.
  await lots.fill('0.03');
  await page.getByRole('button', { name: 'Vender 0.03 lotes a mercado' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible();

  // A sell limit at 110 waits above the market, never fills and expires with the session.
  await page.getByRole('button', { name: 'Vender 102.000' }).click();
  await page.getByRole('button', { name: 'Límite' }).click();
  await expect(page.getByLabel('Precio de la orden')).toHaveValue('102.51');
  await page.getByLabel('Precio de la orden').fill('110');
  await page.getByRole('button', { name: 'Vender 0.03 XAUUSDT LÍMITE 110.000' }).click();
  await expect(page.getByRole('cell', { name: 'Venta límite' })).toBeVisible();

  // Switching to 1 hour keeps the replay where it is.
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.market .price')).toHaveText('102.000');
  await page.getByRole('button', { name: '15m', exact: true }).click();
  await page.getByRole('button', { name: 'Siguiente vela' }).click();
  await expect(page.locator('.market .price')).toHaveText('103.000');
  await page.getByRole('button', { name: 'Terminar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Sesión terminada' })).toBeVisible();
  await expect(page.locator('.stat strong').first()).toHaveText('199.00');
  await expect(page.getByRole('img', { name: 'Saldo de 200 a 199 USD' })).toBeVisible();
  // Both filled trades are boxes on the chart, and the navigator steps through them.
  await expect(page.locator('.result .positions .position')).toHaveCount(2);
  await expect(page.locator('.result .replay-start-text')).toHaveText('Inicio del replay');
  const steps = page.getByRole('navigation', { name: 'Recorrer operaciones' });
  await steps.getByRole('button', { name: 'Siguiente ›' }).click();
  await expect(steps).toContainText('Operación 1 de 2');
  await expect(page.locator('.result .positions .position.focused')).toHaveCount(1);

  // Everything is logged under the student's account.
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(async () => (await listDocuments('practiceSessions'))[0]?.['status'])
    .toBe('finished');
  const [session] = await listDocuments('practiceSessions');
  expect(session).toMatchObject({
    uid: studentUid,
    userName: 'José Pérez',
    symbol: 'XAUUSDT',
    interval: '15m',
    status: 'finished',
    tradeCount: 2,
    pnl: -1,
  });
  const trades = await listDocuments(`practiceSessions/${session['id']}/trades`);
  const summary = trades.map((t) => [t['side'], t['orderType'], t['status'], t['pnl'] ?? null]);
  expect(summary.sort()).toEqual([
    ['long', 'market', 'closed', 2],
    ['short', 'limit', 'cancelled', null],
    ['short', 'market', 'closed', -3],
  ]);

  await page.getByRole('button', { name: 'Nueva práctica' }).click();
  await expect(page.getByRole('cell', { name: 'XAUUSDT · 15m' })).toBeVisible();
  // The student reviews the session again from the list.
  await page.getByRole('button', { name: 'Ver práctica' }).click();
  await expect(steps).toContainText('Operación 1 de 2');
  await expect(page.locator('app-session-review .positions .position')).toHaveCount(2);

  // An admin sees the session and its trades.
  await signOut(page);
  await signIn(page, 'admin@indab.test');
  await nav(page).getByRole('link', { name: 'Administración' }).click();
  await page.getByRole('link', { name: 'Revisar prácticas de trading' }).click();
  await expect(page).toHaveURL('/admin/practice');
  await expect(page.getByRole('cell', { name: 'José Pérez', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver práctica' }).click();
  await expect(page.locator('.detail app-replay-chart canvas').first()).toBeVisible();
  await expect(page.locator('.detail app-session-stats')).toContainText('Acierto');
  await expect(page.getByRole('cell', { name: 'Fin de sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Manual', exact: true })).toBeVisible();
  // The trades are position boxes, stepped through with the navigator.
  await expect(page.locator('.detail .positions .position')).toHaveCount(2);
  await expect(steps).toContainText('Operación 1 de 2');
  await expect(steps).toContainText('Manual');
  await steps.getByRole('button', { name: 'Siguiente ›' }).click();
  await expect(steps).toContainText('Operación 2 de 2');
  await expect(steps).toContainText('Fin de sesión');
  await expect(steps).toContainText('-3.00 USD');

  // ...and can delete it with its trades.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Eliminar práctica de José Pérez' }).click();
  await expect(page.getByText('No hay prácticas registradas.')).toBeVisible();
  expect(await listDocuments('practiceSessions')).toEqual([]);
  expect(await listDocuments(`practiceSessions/${session['id']}/trades`)).toEqual([]);
});

test('a student adds an order from the chart menu and sets it up on its line', async ({ page }) => {
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await expect(page.locator('.market .price')).toHaveText('100.000');

  // Nothing is on the chart until an order is added from the "+" next to the price scale.
  const stage = page.locator('.workspace app-replay-chart .stage');
  await expect(stage.locator('.line-label')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.7);
  await page.getByRole('button', { name: 'Opciones en este precio' }).click();
  // Below the market (100) the menu offers a buy limit and a sell stop.
  await page.getByRole('menuitem', { name: /^Comprar 0\.01 XAUUSDT @ [\d.]+ límite$/ }).click();
  await expect(page.getByRole('button', { name: 'Comprar', exact: true })).toBeVisible();

  // The lots on the line open the quantity pad.
  await page.getByRole('button', { name: 'Lotes de la orden: 0.01' }).click();
  await page
    .getByRole('dialog', { name: 'Cantidad (lotes)' })
    .getByRole('button', { name: '0.05' })
    .click();
  await expect(page.getByRole('button', { name: 'Lotes de la orden: 0.05' })).toBeVisible();

  // The order type menu: as a stop below the market it cannot be placed, as a limit it can.
  await page.getByRole('button', { name: 'Tipo de orden: Límite' }).click();
  await page.getByRole('menuitemradio', { name: 'Stop' }).click();
  await expect(
    page.getByRole('img', { name: /compra stop debe tener su precio por encima/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comprar', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Tipo de orden: Stop' }).click();
  await page.getByRole('menuitemradio', { name: 'Límite' }).click();
  await expect(page.getByRole('button', { name: 'Comprar', exact: true })).toBeEnabled();

  // A click on the TP tab adds a take profit, shaded from the entry, to drag where wanted.
  await page.getByRole('button', { name: 'Añadir take profit' }).click();
  await expect(stage.locator('.line-label', { hasText: 'TP 0.05' })).toBeVisible();
  await expect(stage.locator('.zone.profit')).toBeVisible();
  await page.screenshot({ path: 'test-results/order-line.png' });

  // Its Buy button places it as a pending order, and the line leaves the chart.
  await page.getByRole('button', { name: 'Comprar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Órdenes (1)' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Compra límite' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descartar orden' })).toHaveCount(0);

  // An order added and then discarded with its × places nothing.
  const top = (await stage.boundingBox())!;
  await page.mouse.move(top.x + top.width * 0.3, top.y + top.height * 0.15);
  await page.getByRole('button', { name: 'Opciones en este precio' }).click();
  await page.getByRole('menuitem', { name: /^Vender 0\.05 XAUUSDT @ [\d.]+ límite$/ }).click();
  await page.getByRole('button', { name: 'Descartar orden' }).click();
  await expect(page.getByRole('button', { name: 'Vender', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Órdenes (1)' })).toBeVisible();

  await page.getByRole('button', { name: 'Terminar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Sesión terminada' })).toBeVisible();
  await expect
    .poll(async () => (await listDocuments('practiceSessions'))[0]?.['status'])
    .toBe('finished');
  const [session] = await listDocuments('practiceSessions');
  const trades = await listDocuments(`practiceSessions/${session['id']}/trades`);
  expect(trades).toHaveLength(1);
  expect(trades[0]).toMatchObject({
    side: 'long',
    orderType: 'limit',
    quantity: 5,
    stopLoss: null,
    status: 'cancelled',
  });
  expect(trades[0]['takeProfit']).toEqual(expect.any(Number));
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a student draws on the chart with a finger, as in TradingView', async ({ page }) => {
    await signIn(page, 'jose@indab.test');
    await page.getByRole('link', { name: 'Práctica de trading' }).click();
    await page.getByRole('button', { name: 'Comenzar práctica' }).click();
    await expect(page.locator('.market .price')).toHaveText('100.000');

    // The timeframes sit on top of the chart, next to the indicators and drawings menus.
    const chart = page.locator('.workspace app-replay-chart');
    const tools = chart.getByRole('toolbar', { name: 'Herramientas del gráfico' });
    await expect(tools.getByRole('button', { name: '15m', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await tools.getByRole('button', { name: '1h', exact: true }).tap();
    await expect(tools.getByRole('button', { name: '1h', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The chart fills the screen under the header, as when practising on a phone.
    const stage = chart.locator('.stage');
    const fitChart = () =>
      page.evaluate(() => {
        const chart = document.querySelector('.workspace app-replay-chart')!;
        window.scrollBy({ top: chart.getBoundingClientRect().top - 100, behavior: 'instant' });
      });
    let box = (await stage.boundingBox())!;
    // Real touches, so the chart gets pointer events of a finger.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x: box.x + x, y: box.y + y! }],
      });
    const drag = async (from: [number, number], to: [number, number]) => {
      await fitChart();
      box = (await stage.boundingBox())!;
      await touch('touchStart', ...from);
      for (let i = 1; i <= 5; i++) {
        const at = (k: 0 | 1) => from[k] + ((to[k] - from[k]) * i) / 5;
        await touch('touchMove', at(0), at(1));
      }
      await touch('touchEnd');
    };

    // Fibonacci: drag the crosshair to the start of the move, let go, then drag to its end.
    await tools.getByRole('button', { name: 'Herramientas de dibujo' }).tap();
    await page.getByRole('menuitemradio', { name: 'Retroceso de Fibonacci' }).tap();
    await expect(page.getByRole('status')).toContainText('Marca el inicio del movimiento.');
    await drag([150, 150], [120, 100]);
    await expect(page.getByRole('status')).toContainText('Marca el final del movimiento.');
    await drag([200, 200], [230, 260]);
    await expect(stage.locator('svg.shapes .fib')).toHaveCount(7);
    await expect(stage.locator('.handle')).toHaveCount(2);
    // Its ends moved with the finger: 50 px down from the first point to the second.
    const [start, end] = await stage
      .locator('.handle')
      .evaluateAll((handles) => handles.map((h) => parseFloat((h as HTMLElement).style.top)));
    expect(end - start).toBeGreaterThan(40);
    // The finger neither scrolled the page nor panned the chart.
    expect((await stage.boundingBox())!.y).toBe(box.y);
    await page.screenshot({ path: 'test-results/phone-fibonacci.png' });

    // Selected, it can be recolored and deleted from its bar.
    const bar = page.getByRole('toolbar', { name: 'Opciones del dibujo' });
    await bar.getByRole('button', { name: 'Color rojo' }).tap();
    await expect(stage.locator('svg.shapes g').first()).toHaveAttribute('stroke', '#f23645');
    await bar.getByRole('button', { name: 'Borrar dibujo' }).tap();
    await expect(stage.locator('svg.shapes .fib')).toHaveCount(0);

    // A rectangle from two taps, then stretched by its bottom right handle.
    await tools.getByRole('button', { name: 'Herramientas de dibujo' }).tap();
    await page.getByRole('menuitemradio', { name: 'Rectángulo' }).tap();
    await fitChart();
    box = (await stage.boundingBox())!;
    await page.touchscreen.tap(box.x + 100, box.y + 120);
    await page.touchscreen.tap(box.x + 160, box.y + 180);
    const rect = stage.locator('svg.shapes rect');
    await expect(rect).toBeVisible();
    await expect(stage.locator('.handle')).toHaveCount(8);
    const before = Number(await rect.getAttribute('height'));
    const corner = (await stage.locator('.handle').nth(4).boundingBox())!;
    const cx = corner.x - box.x + corner.width / 2;
    const cy = corner.y - box.y + corner.height / 2;
    await drag([cx, cy], [cx + 20, cy + 40]);
    await expect
      .poll(async () => Number(await rect.getAttribute('height')))
      .toBeGreaterThan(before + 30);

    // A tap elsewhere puts the selection down.
    await page.touchscreen.tap(box.x + 40, box.y + 300);
    await expect(stage.locator('.handle')).toHaveCount(0);
    await expect(rect).toBeVisible();

    // A long position from two taps: the second, above the entry, is its target.
    await tools.getByRole('button', { name: 'Herramientas de dibujo' }).tap();
    await page.getByRole('menuitemradio', { name: 'Posición larga' }).tap();
    await fitChart();
    box = (await stage.boundingBox())!;
    await page.touchscreen.tap(box.x + 120, box.y + 220);
    await page.touchscreen.tap(box.x + 220, box.y + 170);
    await expect(stage.locator('svg.shapes rect.profit')).toBeVisible();
    await expect(stage.locator('svg.shapes rect.loss')).toBeVisible();
    await expect(stage.locator('svg.shapes .measure-text').last()).toHaveText(
      'Riesgo/beneficio: 1.00',
    );
  });
});
