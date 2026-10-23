import { Page, expect, test } from '@playwright/test';
import { createUser, listDocuments, resetEmulators } from './emulators';
import { nav, signIn, signOut } from './helpers';

// Binance is replaced by a fixed series: 100 before the replay start, then every minute of the
// k-th 15-minute bar at 101 + k, so each step on 15 minutes raises the price by 1 and every
// entry and exit price below is predictable. The start is read off the first request.
const SECONDS: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
};
let replayStart = 0;

const mockMarket = (page: Page) =>
  page.route(/binance\.(vision|com)\/api\/v3\/klines/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const seconds = SECONDS[params.get('interval')!];
    const from = Number(params.get('startTime')) / 1000;
    const limit = Number(params.get('limit'));
    replayStart ||= seconds === 60 ? from + 60 : from + 500 * seconds;
    const json = Array.from({ length: limit }, (_, i) => {
      const time = from + i * seconds;
      const close = time < replayStart ? 100 : 101 + Math.floor((time - replayStart) / 900);
      return [time * 1000, `${close}`, `${close}`, `${close}`, `${close}`, '1'];
    });
    return route.fulfill({ json, headers: { 'Access-Control-Allow-Origin': '*' } });
  });

let studentUid: string;

test.beforeEach(async ({ page }) => {
  replayStart = 0;
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

  // Buy 0.01 lots (1 oz) at 100 with a stop loss, then let two 15-minute candles pass.
  const lots = page.getByRole('spinbutton', { name: /Lotes \(tamaño/ });
  await lots.fill('0.01');
  await page.getByRole('switch', { name: 'Stop loss' }).check();
  await page.getByLabel('Precio del stop loss').fill('95');
  await expect(page.locator('.bracket .field')).toContainText('-5.00 USD');
  await page.getByRole('button', { name: 'Comprar 0.01 PAXGUSDT MERCADO' }).click();
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente vela' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.market .price')).toHaveText('102.000');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Historial (1)' }).click();
  await expect(page.getByRole('cell', { name: 'Manual' })).toBeVisible();

  // Sell 0.03 lots in one click from the chart and leave it open until the session ends.
  await lots.fill('0.03');
  await page.getByRole('button', { name: 'Vender 0.03 lotes a mercado' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible();

  // A sell limit at 110 waits above the market, never fills and expires with the session.
  await page.getByRole('button', { name: 'Vender 102.000' }).click();
  await page.getByRole('button', { name: 'Límite' }).click();
  await expect(page.getByLabel('Precio de la orden')).toHaveValue('102.51');
  await page.getByLabel('Precio de la orden').fill('110');
  await page.getByRole('button', { name: 'Vender 0.03 PAXGUSDT LÍMITE 110.000' }).click();
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

  // Everything is logged under the student's account.
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(async () => (await listDocuments('practiceSessions'))[0]?.['status'])
    .toBe('finished');
  const [session] = await listDocuments('practiceSessions');
  expect(session).toMatchObject({
    uid: studentUid,
    userName: 'José Pérez',
    symbol: 'PAXGUSDT',
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
  await expect(page.getByRole('cell', { name: 'PAXGUSDT · 15m' })).toBeVisible();

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

  // ...and can delete it with its trades.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Eliminar práctica de José Pérez' }).click();
  await expect(page.getByText('No hay prácticas registradas.')).toBeVisible();
  expect(await listDocuments('practiceSessions')).toEqual([]);
  expect(await listDocuments(`practiceSessions/${session['id']}/trades`)).toEqual([]);
});
