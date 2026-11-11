import { Locator, WebSocketRoute, expect, test } from '@playwright/test';
import { createUser, listDocuments, resetEmulators, setDocument } from './emulators';
import { endSession, nav, signIn, signOut } from './helpers';
import { mockMarket, mockWavyMarket } from './market';

let studentUid: string;

/**
 * Waits until `target` stops moving: once the page scrolls, the sticky header shrinks with an
 * animation and moves everything under it for a moment, so clicks and touches would miss.
 */
async function settled(target: Locator): Promise<void> {
  let last: number | undefined;
  await expect
    .poll(async () => {
      const y = (await target.boundingBox())!.y;
      const still = y === last;
      last = y;
      return still;
    })
    .toBe(true);
}

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

test('a reload picks the practice up where it was left', async ({ page }) => {
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await page.getByRole('button', { name: 'Comprar 0.01 lotes a mercado' }).click();
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente vela' }).click();
  await page.getByRole('button', { name: 'Siguiente vela' }).click();
  await expect(page.locator('.market .price')).toHaveText('102.000');
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.reload();
  await expect(page.getByText('Retomaste tu sesión donde la dejaste')).toBeVisible();
  await expect(page.locator('.market .price')).toHaveText('102.000');
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Only one session: the same one goes on.
  expect(await listDocuments('practiceSessions')).toHaveLength(1);
  // Ending asks first; "Seguir operando" keeps the session going.
  await page.getByRole('button', { name: 'Terminar sesión' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Terminar la sesión?' });
  await confirm.getByRole('button', { name: 'Seguir operando' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  await endSession(page);
  await expect(page.getByRole('heading', { name: 'Sesión terminada' })).toBeVisible();
  await expect
    .poll(async () => (await listDocuments('practiceSessions'))[0]?.['status'])
    .toBe('finished');

  // A finished session is not picked up again.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Comenzar práctica' })).toBeVisible();
});

test('a practice stays open until the student closes it, wherever they go', async ({ page }) => {
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await page.getByRole('button', { name: 'Comprar 0.01 lotes a mercado' }).click();
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente vela' }).click();
  await expect(page.locator('.market .price')).toHaveText('101.000');

  // Leaving for another page keeps it open, and the academy leads back to it.
  await page.getByRole('link', { name: '← Academia' }).click();
  await expect(page).toHaveURL('/academy');
  await expect(page.getByText('Tienes una práctica abierta')).toBeVisible();
  expect((await listDocuments('practiceSessions'))[0]?.['status']).toBe('active');
  await page.getByRole('link', { name: /Continuar práctica/ }).click();
  await expect(page.getByText('Retomaste tu sesión donde la dejaste')).toBeVisible();
  await expect(page.locator('.market .price')).toHaveText('101.000');
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();

  // Back to the list without closing it: it waits there, and no other free practice starts.
  await page.getByRole('button', { name: 'Salir sin cerrar' }).click();
  const open = page.locator('.open-session');
  await expect(open).toContainText('Práctica libre');
  await expect(page.getByRole('button', { name: 'Comenzar práctica' })).toHaveCount(0);
  await open.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.market .price')).toHaveText('101.000');

  // Closing it is the student's call.
  await page.getByRole('button', { name: 'Salir sin cerrar' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await open.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('button', { name: 'Comenzar práctica' })).toBeVisible();
  await expect
    .poll(async () => (await listDocuments('practiceSessions'))[0]?.['status'])
    .toBe('finished');
  expect(await listDocuments('practiceSessions')).toHaveLength(1);
});

test('an evaluation left open is handed in once its time is up', async ({ page }) => {
  const replayStart = Date.UTC(2026, 1, 2, 8);
  const id = `ev1_${studentUid}`;
  await setDocument(`practiceSessions/${id}`, {
    uid: studentUid,
    userName: 'José Pérez',
    symbol: 'XAUUSDT',
    interval: '15m',
    replayStart,
    startingBalance: 200,
    balance: 200,
    pnl: 0,
    tradeCount: 1,
    status: 'active',
    startedAt: new Date(Date.now() - 45 * 60_000),
    evaluationId: 'ev1',
    durationMinutes: 20,
  });
  await setDocument(`practiceSessions/${id}/trades/t1`, {
    uid: studentUid,
    side: 'long',
    orderType: 'market',
    orderPrice: null,
    placedTime: replayStart / 1000,
    quantity: 0.01,
    entryPrice: 100,
    entryTime: replayStart / 1000,
    stopLoss: null,
    takeProfit: null,
    status: 'open',
    openedAt: new Date(),
  });
  await signIn(page, 'jose@indab.test');
  // Its time is up, so the academy no longer offers to go back to it...
  await expect(page.getByRole('link', { name: 'Práctica de trading' })).toBeVisible();
  await expect(page.getByText('Tienes una práctica abierta')).toHaveCount(0);
  // ...and the practice page closes it where it was left.
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await expect(page.getByRole('button', { name: 'Comenzar práctica' })).toBeVisible();
  await expect
    .poll(async () => (await listDocuments('practiceSessions'))[0]?.['status'])
    .toBe('finished');
  expect(await listDocuments(`practiceSessions/${id}/trades`)).toEqual([
    expect.objectContaining({ status: 'closed', exitReason: 'sessionEnd' }),
  ]);
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
  await expect(page.getByRole('cell', { name: 'Venta límite', exact: true })).toBeVisible();

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
  await endSession(page);
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
  await settled(stage);
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
  await expect(page.getByRole('cell', { name: 'Compra límite', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descartar orden' })).toHaveCount(0);

  // An order added and then discarded with its × places nothing.
  const top = (await stage.boundingBox())!;
  await page.mouse.move(top.x + top.width * 0.3, top.y + top.height * 0.15);
  await page.getByRole('button', { name: 'Opciones en este precio' }).click();
  await page.getByRole('menuitem', { name: /^Vender 0\.05 XAUUSDT @ [\d.]+ límite$/ }).click();
  await page.getByRole('button', { name: 'Descartar orden' }).click();
  await expect(page.getByRole('button', { name: 'Vender', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Órdenes (1)' })).toBeVisible();

  // The order is logged as it is placed...
  const [session] = await listDocuments('practiceSessions');
  await expect
    .poll(() => listDocuments(`practiceSessions/${session['id']}/trades`))
    .toEqual([
      expect.objectContaining({
        side: 'long',
        orderType: 'limit',
        quantity: 5,
        stopLoss: null,
        takeProfit: expect.any(Number),
        status: 'pending',
      }),
    ]);

  // ...but it never filled: without a single entry, ending warns and keeps nothing.
  await page.getByRole('button', { name: 'Terminar sesión' }).click();
  await expect(page.getByRole('dialog', { name: '¿Terminar la sesión?' })).toContainText(
    'Aún no hiciste ninguna entrada. Si terminas ahora, esta sesión no se guardará',
  );
  await page.getByRole('button', { name: 'Seguir operando' }).click();
  await endSession(page, true);
  await expect(
    page.getByText('La sesión no se guardó porque no hiciste ninguna entrada.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comenzar práctica' })).toBeVisible();
  await expect.poll(() => listDocuments('practiceSessions')).toEqual([]);
  expect(await listDocuments(`practiceSessions/${session['id']}/trades`)).toEqual([]);
});

test('a student holds several positions and orders at gold prices, up to the margin', async ({
  page,
}) => {
  // Gold near 4,000 USD at 1:200: 0.02 lots (2 oz) tie up 40 USD of the 200, so four orders fit.
  await page.unrouteAll();
  await mockMarket(page, 4000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await expect(page.locator('.market .price')).toHaveText('4,000.00');
  await page.getByRole('spinbutton', { name: /Lotes \(tamaño/ }).fill('0.02');

  await page.getByRole('button', { name: 'Comprar 0.02 XAUUSDT MERCADO' }).click();
  await page.getByRole('button', { name: 'Vender 0.02 lotes a mercado' }).click();
  // A one-click order has no stop loss: the box under it warns, without stopping it.
  await expect(
    page.getByRole('group', { name: 'Operación rápida a mercado' }).getByRole('alert'),
  ).toContainText('Esta orden no tiene stop loss.');
  await page.getByRole('button', { name: 'Comprar 0.02 lotes a mercado' }).click();
  await expect(page.getByRole('button', { name: 'Posiciones (3)' })).toBeVisible();
  // A sell limit at 4,100 (41 USD of margin) waits next to them.
  await page.getByRole('button', { name: 'Vender 4,000.00' }).click();
  await page.getByRole('button', { name: 'Límite' }).click();
  await page.getByLabel('Precio de la orden').fill('4100');
  await page.getByRole('button', { name: 'Vender 0.02 XAUUSDT LÍMITE 4,100.00' }).click();
  await expect(page.getByRole('button', { name: 'Órdenes (1)' })).toBeVisible();

  // 39 USD are left, so a fifth does not fit: the chart's one-click box says why, right under it.
  await page.getByRole('button', { name: 'Vender 0.02 lotes a mercado' }).click();
  const refusal = page
    .getByRole('group', { name: 'Operación rápida a mercado' })
    .getByRole('alert');
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText('Margen insuficiente: la orden necesita 40.00 USD');
  await expect(refusal).toContainText('Con ese margen puedes abrir hasta 0.01 lotes.');
  await expect(page.getByRole('button', { name: 'Posiciones (3)' })).toBeVisible();
  // The chart counts them, and their labels, all at 4,000, are stacked so each can be read.
  const chart = page.locator('.workspace app-replay-chart');
  await expect(chart.locator('.open-count')).toContainText('3 posiciones · 1 orden');
  const tops = await chart
    .locator('.line-label', { has: page.locator('.qty') })
    .evaluateAll((labels) => labels.map((l) => l.getBoundingClientRect().top).filter((y) => y > 0));
  // (The limit at 4,100 is off the price scale.)
  expect(tops).toHaveLength(3);
  expect(new Set(tops).size).toBe(3);
  await expect(chart.locator('.leader')).toHaveCount(2);

  // Closing one position frees room for another.
  await page.getByRole('button', { name: 'Posiciones (3)' }).click();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Vender 0.02 lotes a mercado' }).click();
  await expect(page.getByRole('button', { name: 'Posiciones (3)' })).toBeVisible();
  // No refusal now, only the warning that it has no stop loss.
  await expect(refusal).not.toContainText('Margen insuficiente');
  await expect(refusal).toContainText('Esta orden no tiene stop loss.');
  await expect(page.getByRole('button', { name: 'Historial (1)' })).toBeVisible();

  await endSession(page);
  await expect(page.getByRole('heading', { name: 'Sesión terminada' })).toBeVisible();
  await expect
    .poll(async () => (await listDocuments('practiceSessions'))[0]?.['status'])
    .toBe('finished');
  const [session] = await listDocuments('practiceSessions');
  const trades = await listDocuments(`practiceSessions/${session['id']}/trades`);
  expect(trades).toHaveLength(5);
});

test('a student edits a placed order and a position from the order panel', async ({ page }) => {
  await page.unrouteAll();
  await mockMarket(page, 4000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await expect(page.locator('.market .price')).toHaveText('4,000.00');

  // A buy limit at 3,900 waits below the market.
  await page.getByRole('button', { name: 'Límite' }).click();
  await page.getByLabel('Precio de la orden').fill('3900');
  await page.getByRole('button', { name: 'Comprar 0.01 XAUUSDT LÍMITE 3,900.00' }).click();
  await expect(page.getByRole('button', { name: 'Órdenes (1)' })).toBeVisible();

  // "Editar" loads it into the ticket: new price, lots and a stop loss, then save.
  await page.getByRole('button', { name: 'Editar compra límite' }).click();
  const ticket = page.getByRole('complementary', { name: 'Panel de órdenes' });
  await expect(ticket.getByRole('status')).toContainText('Editando: Compra límite');
  await page.getByLabel('Precio de la orden').fill('3950');
  await page.getByRole('spinbutton', { name: /Lotes \(tamaño/ }).fill('0.03');
  await ticket.getByRole('switch', { name: 'Stop loss' }).check();
  await page.getByLabel('Precio del stop loss').fill('3900');
  await ticket.screenshot({ path: 'test-results/edit-order-ticket.png' });
  await page.screenshot({ path: 'test-results/edit-order-desk.png' });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(ticket.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: '3,950.00' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '0.03' })).toBeVisible();

  // An open position only changes its exits.
  await page.getByRole('button', { name: 'Comprar 0.01 lotes a mercado' }).click();
  await page.getByRole('button', { name: 'Posiciones (1)' }).click();
  await page.getByRole('button', { name: 'Editar posición de compra' }).click();
  await expect(ticket.getByRole('status')).toContainText('Editando posición de compra');
  await expect(page.getByLabel('Precio de la orden')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: /Lotes \(tamaño/ })).toBeDisabled();
  await ticket.getByRole('switch', { name: 'Take profit' }).check();
  await page.getByLabel('Precio del take profit').fill('4100');
  await page.screenshot({ path: 'test-results/edit-position-desk.png' });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('cell', { name: '4,100.00' })).toBeVisible();
  // (The one-click box only warns that its order had no stop loss.)
  await expect(ticket.getByRole('alert')).toHaveCount(0);

  const [session] = await listDocuments('practiceSessions');
  await expect
    .poll(async () => {
      const trades = await listDocuments(`practiceSessions/${session['id']}/trades`);
      return trades
        .map((t) => [t['status'], t['orderPrice'], t['quantity'], t['stopLoss'], t['takeProfit']])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    })
    .toEqual([
      ['open', null, 1, null, 4100],
      ['pending', 3950, 3, 3900, null],
    ]);

  // On a phone the ticket comes into view when "Editar" is tapped.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Órdenes (1)' }).click();
  await page.getByRole('button', { name: 'Editar compra límite' }).click();
  await expect(ticket.getByRole('status')).toBeInViewport();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/edit-order-phone.png' });
  await page.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(ticket.getByRole('status')).toHaveCount(0);
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
    const fitChart = async () => {
      await page.evaluate(() => {
        const chart = document.querySelector('.workspace app-replay-chart')!;
        window.scrollBy({ top: chart.getBoundingClientRect().top - 100, behavior: 'instant' });
      });
      await settled(stage);
    };
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
    await expect(stage.locator('svg.shapes .fib')).toHaveCount(19);
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
    const rect = stage.locator('svg.shapes rect.rect');
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

    // A Gann box: drag the crosshair to one corner, let go, then drag it to the opposite one.
    await bar.getByRole('button', { name: 'Borrar dibujo' }).tap();
    await tools.getByRole('button', { name: 'Herramientas de dibujo' }).tap();
    await page.getByRole('menuitemradio', { name: 'Cuadrícula de Gann' }).tap();
    await expect(page.getByRole('status')).toContainText('Marca una esquina de la cuadrícula.');
    await drag([60, 240], [40, 240]);
    await expect(page.getByRole('status')).toContainText('Marca la esquina opuesta.');
    // The crosshair moves as much as the finger, from the first corner.
    await drag([100, 240], [380, 60]);
    // Five levels (0, 0.25, 0.5, 0.75, 1) and a handle on each corner to reshape it.
    await expect(stage.locator('svg.shapes line.gann')).toHaveCount(5);
    await expect(stage.locator('.handle')).toHaveCount(4);
    expect((await stage.boundingBox())!.y).toBe(box.y);
    await page.screenshot({ path: 'test-results/phone-gann.png' });
  });

  test('a student sets up an indicator on a full-screen sheet', async ({ page }) => {
    await mockWavyMarket(page);
    await signIn(page, 'jose@indab.test');
    await page.getByRole('link', { name: 'Práctica de trading' }).click();
    await page.getByRole('button', { name: 'Comenzar práctica' }).click();
    await expect(page.getByRole('button', { name: 'Terminar sesión' })).toBeVisible();

    const chart = page.locator('.workspace app-replay-chart');
    await chart.getByRole('button', { name: 'Indicadores' }).tap();
    await page.getByRole('menuitemcheckbox', { name: 'SuperTrend 10 3' }).tap();
    await page.getByRole('menuitem', { name: 'Ajustes de SuperTrend' }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('SuperTrend 10 3');
    // The sheet covers the screen, as in TradingView's app, and the page stays phone-wide at
    // gold prices.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const box = (await dialog.boundingBox())!;
    expect([box.x, box.y, box.width]).toEqual([0, 0, 390]);
    await expect(dialog.getByLabel('Mostrar etiquetas BUY/SELL')).toBeChecked();
    await dialog.getByLabel('Factor').fill('2');
    await dialog.getByLabel('Factor').blur();
    await expect(dialog.getByRole('heading')).toHaveText('SuperTrend 10 2');
    await page.screenshot({ path: 'test-results/phone-indicator-settings.png' });
    await dialog.getByRole('button', { name: 'Aceptar' }).tap();
    await expect(dialog).toBeHidden();
    await page.evaluate(() => {
      const top = document
        .querySelector('.workspace app-replay-chart')!
        .getBoundingClientRect().top;
      window.scrollBy({ top: top - 100, behavior: 'instant' });
    });
    await page.screenshot({ path: 'test-results/phone-indicators.png' });
  });
});

test('a student draws a Gann box with the mouse and reshapes it', async ({ page }) => {
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await expect(page.locator('.market .price')).toHaveText('100.000');

  const chart = page.locator('.workspace app-replay-chart');
  const stage = chart.locator('.stage');
  await chart.getByRole('button', { name: 'Herramientas de dibujo' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Cuadrícula de Gann' })).toBeVisible();
  await expect(page.locator('.tool-menu')).toContainText('Gann y Fibonacci');
  await page.screenshot({ path: 'test-results/desk-gann-menu.png' });
  await page.getByRole('menuitemradio', { name: 'Cuadrícula de Gann' }).click();
  await stage.scrollIntoViewIfNeeded();
  await settled(stage);
  const box = (await stage.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.7);
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25);
  const gann = stage.locator('svg.shapes line.gann');
  await expect(gann).toHaveCount(5);
  await expect(stage.locator('.handle')).toHaveCount(4);

  // Its top right corner drags further right, and the levels stretch with it.
  const right = (await stage.locator('.handle').nth(1).boundingBox())!;
  const x = right.x + right.width / 2;
  const y = right.y + right.height / 2;
  const lastColumn = () => gann.last().getAttribute('x2').then(Number);
  const before = await lastColumn();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(lastColumn).toBeGreaterThan(before + 30);
  await page.screenshot({ path: 'test-results/desk-gann.png' });
});

test("the chart keeps each student's indicators for their next sessions", async ({ page }) => {
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await expect(page.locator('.market .price')).toHaveText('100.000');

  // The RSI is on from the start, the averages are not.
  const chart = page.locator('.workspace app-replay-chart');
  await chart.getByRole('button', { name: 'Indicadores' }).click();
  const item = (name: string) => page.getByRole('menuitemcheckbox', { name });
  await expect(item('RSI 14')).toHaveAttribute('aria-checked', 'true');
  await expect(item('EMA 100')).toHaveAttribute('aria-checked', 'false');
  await item('EMA 100').click();
  await item('EMA 200').click();
  await item('Volumen').click();
  await expect(item('EMA 200')).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(async () => (await listDocuments(`users/${studentUid}/settings`))[0]?.['indicators'])
    .toEqual(['ema100', 'ema200', 'rsi14', 'volume']);

  // The next session opens with them.
  // No entries were made, so the session is not kept.
  await endSession(page, true);
  await expect.poll(() => listDocuments('practiceSessions')).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await expect(page.getByRole('button', { name: 'Terminar sesión' })).toBeVisible();
  await chart.getByRole('button', { name: 'Indicadores' }).click();
  for (const name of ['EMA 100', 'EMA 200', 'RSI 14', 'Volumen']) {
    await expect(item(name)).toHaveAttribute('aria-checked', 'true');
  }
});

test('a student adds classic indicators and sets one up as in TradingView', async ({ page }) => {
  await mockWavyMarket(page);
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await expect(page.getByRole('button', { name: 'Terminar sesión' })).toBeVisible();

  const chart = page.locator('.workspace app-replay-chart');
  const menu = () => chart.getByRole('button', { name: 'Indicadores' }).click();
  const item = (name: string) => page.getByRole('menuitemcheckbox', { name });
  await page.evaluate(() => {
    const top = document.querySelector('.workspace app-replay-chart')!.getBoundingClientRect().top;
    window.scrollBy({ top: top - 80, behavior: 'instant' });
  });
  await menu();
  await item('EMA 100').click();
  await item('Bandas de Bollinger 20 2').click();
  await item('MACD 12 26 9').click();
  await item('SuperTrend 10 3').click();
  await expect(item('MACD 12 26 9')).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: 'test-results/desk-indicators-menu.png' });

  // The gear next to EMA 100 opens its settings: inputs, style and visibility.
  await page.getByRole('menuitem', { name: 'Ajustes de EMA 100' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toHaveText('EMA 100');
  await expect(dialog.getByRole('tab', { name: 'Entradas de datos' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await dialog.getByLabel('Longitud').fill('50');
  await dialog.getByLabel('Longitud').blur();
  await expect(dialog.getByRole('heading')).toHaveText('EMA 50');
  await page.screenshot({ path: 'test-results/desk-indicator-settings.png' });
  await dialog.getByRole('tab', { name: 'Estilo' }).click();
  await dialog.getByLabel('Grosor de Línea').selectOption('3');
  await dialog.getByRole('tab', { name: 'Visibilidad' }).click();
  await expect(dialog.getByLabel('4h')).toBeChecked();
  await dialog.getByRole('button', { name: 'Aceptar' }).click();
  await expect(dialog).toBeHidden();

  // Kept for the next sessions, with the indicators on.
  await expect
    .poll(async () => (await listDocuments(`users/${studentUid}/settings`))[0]?.['configs'])
    .toEqual({
      ema100: {
        inputs: { length: 50 },
        colors: { ema: '#ff9800' },
        widths: { ema: 3 },
        hidden: [],
      },
    });
  await menu();
  await expect(item('EMA 50')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await chart.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/desk-indicators.png' });
});

test('the replay plays, pauses and changes speed from its controls', async ({ page }) => {
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();

  const controls = page.getByRole('group', { name: 'Controles de reproducción' });
  await controls.getByRole('radio', { name: '1 velas/s' }).click();
  await expect(controls.getByRole('radio', { name: '1 velas/s' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await controls.getByRole('button', { name: 'Reproducir' }).click();
  await expect(controls.getByRole('button', { name: 'Pausar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Space pauses, unless a button has the focus (it presses that button instead).
  await page.locator('h1').click();
  await page.keyboard.press('Space');
  await expect(controls.getByRole('button', { name: 'Reproducir' })).toBeVisible();
});

test('the chart shows the economic news of the replayed days, revealing them on time with hidden dates', async ({
  page,
}) => {
  const release = async (id: string, iso: string, name: string, impact: string) =>
    setDocument(`marketNews/${id}`, {
      time: Date.parse(iso) / 1000,
      name,
      country: 'US',
      impact,
      actual: '151K',
      forecast: '160K',
      previous: '125K',
      updatedBy: 'seed',
      updatedAt: new Date(),
    });
  await release('nfp', '2026-03-03T20:00:00Z', 'Nonfarm Payrolls', 'high');
  await release('cpi', '2026-03-04T00:30:00Z', 'CPI m/m', 'medium');

  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByLabel('Elegir fecha').check();
  await page.getByLabel('Fecha de inicio', { exact: true }).fill('2026-03-04');
  await page.getByLabel('Ocultar fechas durante la práctica').uncheck();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await expect(page.locator('.market .price')).toHaveText('100.000');

  // A release the replay passed shows its figures; one still to come does not.
  const chart = page.locator('.workspace app-replay-chart');
  await chart.getByRole('button', { name: '1 noticia, impacto alto' }).click();
  const card = chart.getByRole('dialog', { name: 'Noticias económicas' });
  await expect(card).toContainText('Nonfarm Payrolls');
  await expect(card).toContainText('151K');
  await expect(card.getByRole('link')).toHaveCount(0);
  await card.getByRole('button', { name: 'Cerrar' }).click();
  await chart.getByRole('button', { name: '1 noticia, impacto medio' }).click();
  await expect(card).toContainText('CPI m/m');
  await expect(card).toContainText('Por publicarse');
  await expect(card).not.toContainText('151K');

  // Switched off, they stay off for the next sessions.
  await chart.getByRole('button', { name: 'Indicadores' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Noticias' }).click();
  await expect(chart.locator('.news-mark')).toHaveCount(0);
  await expect
    .poll(async () => (await listDocuments(`users/${studentUid}/settings`))[0]?.['news'])
    .toBe(false);
  await page.getByRole('menuitemcheckbox', { name: 'Noticias' }).click();
  await expect(chart.locator('.news-mark')).toHaveCount(2);

  // With the dates hidden, a release shows only its impact until the replay reaches it.
  // No entries were made, so the session is not kept.
  await endSession(page, true);
  await expect.poll(() => listDocuments('practiceSessions')).toEqual([]);
  await page.reload();
  await page.getByLabel('Elegir fecha').check();
  await page.getByLabel('Fecha de inicio', { exact: true }).fill('2026-03-04');
  await page.getByLabel('Ocultar fechas durante la práctica').check();
  await page.getByRole('button', { name: 'Comenzar práctica' }).click();
  await chart.getByRole('button', { name: '1 noticia, impacto medio' }).click();
  await expect(card).toContainText('Noticia de impacto medio');
  await expect(card).not.toContainText('CPI');
  await expect(card).toContainText('el nombre y las cifras de cada noticia se revelan');
  await card.getByRole('button', { name: 'Cerrar' }).click();
  await chart.getByRole('button', { name: '1 noticia, impacto alto' }).click();
  await expect(card).toContainText('Nonfarm Payrolls');
  await expect(card).toContainText('151K');
});

test('a student trades gold live on the candles as they form', async ({ page }) => {
  // Binance as of now: flat at 4000 up to the minute still forming, and its stream on demand.
  const minute = Math.floor(Date.now() / 60_000) * 60;
  await page.route(/fapi\.binance\.com\/fapi\/v1\/klines/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const seconds = { '1m': 60, '15m': 900, '1h': 3600, '4h': 14400 }[params.get('interval')!]!;
    const limit = Number(params.get('limit'));
    const times = params.has('endTime')
      ? Array.from(
          { length: limit },
          (_, i) =>
            Math.ceil((Number(params.get('endTime')) + 1) / 1000 / seconds) * seconds -
            (limit - i) * seconds,
        )
      : Array.from(
          { length: limit },
          (_, i) =>
            Math.ceil(Number(params.get('startTime')) / 1000 / seconds) * seconds + i * seconds,
        ).filter((time) => time <= minute);
    const json = times.map((time) => [time * 1000, '4000', '4000', '4000', '4000', '1', 0, '1', 5]);
    return route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  let stream: WebSocketRoute | null = null;
  await page.routeWebSocket(/fstream\.binance\.com\/market\/ws\/xauusdt@kline_1m/, (ws) => {
    stream = ws;
  });
  const send = (price: number) =>
    stream!.send(
      JSON.stringify({
        e: 'kline',
        s: 'XAUUSDT',
        k: {
          t: minute * 1000,
          i: '1m',
          o: '4000',
          h: `${price}`,
          l: '4000',
          c: `${price}`,
          v: '3',
          n: 9,
          x: false,
        },
      }),
    );

  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await page.getByLabel(/En vivo: el mercado de ahora/).check();
  const start = page.getByRole('button', { name: 'Empezar en vivo' });
  if (await page.getByText('El mercado del oro está cerrado ahora').isVisible()) {
    // Gold's weekend or daily break: live trading waits for the market.
    await expect(start).toBeDisabled();
    return;
  }
  await start.click();
  await expect(page.getByText('Velas del mercado en tiempo real.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente vela' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Comprar 0.01 lotes a mercado' }).click();
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();

  send(4010);
  await expect(page.locator('.market .price')).toHaveText('4,010.00');
  await expect(page.locator('.open-count .pnl')).toHaveText('+10.00 USD');
  const [session] = await listDocuments('practiceSessions');
  expect(session?.['live']).toBe(true);

  // A reload picks it up live, with the position still open.
  await page.reload();
  await expect(page.getByText('Retomaste tu sesión donde la dejaste')).toBeVisible();
  await expect(page.getByText('Velas del mercado en tiempo real.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  send(4005);
  await expect(page.locator('.market .price')).toHaveText('4,005.00');

  await endSession(page);
  await expect(page.getByRole('heading', { name: 'Sesión terminada' })).toBeVisible();
  await expect(page.getByText('operado en vivo')).toBeVisible();
  await page.getByRole('button', { name: 'Nueva práctica' }).click();
  await expect(page.locator('table.trades .live-badge')).toHaveText('En vivo');
  await expect
    .poll(async () => (await listDocuments('practiceSessions'))[0]?.['status'])
    .toBe('finished');
});
