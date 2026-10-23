import { Page, expect, test } from '@playwright/test';
import { createUser, listDocuments, resetEmulators } from './emulators';
import { nav, signIn, signOut } from './helpers';

// Binance is replaced by a fixed series: 1000 hourly candles at 100, then +1 per candle,
// so every entry and exit price below is predictable.
const HOUR = 3_600_000;
const klines = Array.from({ length: 1000 }, (_, i) => {
  const close = i < 150 ? 100 : 100 + (i - 149);
  return [Date.UTC(2021, 4, 10) + i * HOUR, `${close}`, `${close}`, `${close}`, `${close}`, '1'];
});

const mockMarket = (page: Page) =>
  page.route(/binance\.(vision|com)\/api\/v3\/klines/, (route) =>
    route.fulfill({ json: klines, headers: { 'Access-Control-Allow-Origin': '*' } }),
  );

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

  // Buy 1000 USD at 100 with a stop loss, then let two candles pass.
  await page.getByLabel('Monto (USD)').fill('1000');
  await page.getByLabel('Stop loss (opcional)').fill('95');
  await page.getByRole('button', { name: 'Abrir operación' }).click();
  await expect(page.getByText('No tienes operaciones abiertas.')).toBeHidden();
  await page.getByRole('button', { name: 'Siguiente vela' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.market .price')).toHaveText('102.000');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Manual' })).toBeVisible();

  // Sell 500 USD and leave it open until the session ends one candle later.
  await page.getByRole('button', { name: 'Vender' }).click();
  await page.getByLabel('Monto (USD)').fill('500');
  await page.getByLabel('Stop loss (opcional)').fill('');
  await page.getByRole('button', { name: 'Abrir operación' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible();

  // A sell limit at 110 waits above the market, never fills and expires with the session.
  await page.getByLabel('Tipo de orden').selectOption('limit');
  await expect(page.getByLabel('Precio de la orden')).toHaveValue('102.51');
  await page.getByLabel('Precio de la orden').fill('110');
  await page.getByRole('button', { name: 'Colocar orden' }).click();
  await expect(page.getByRole('cell', { name: 'Venta límite' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente vela' }).click();
  await page.getByRole('button', { name: 'Terminar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Sesión terminada' })).toBeVisible();
  await expect(page.locator('.stat strong').first()).toHaveText('10,015.10');

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
    interval: '1h',
    status: 'finished',
    tradeCount: 2,
    pnl: 15.1,
  });
  const trades = await listDocuments(`practiceSessions/${session['id']}/trades`);
  const summary = trades.map((t) => [t['side'], t['orderType'], t['status'], t['pnl'] ?? null]);
  expect(summary.sort()).toEqual([
    ['long', 'market', 'closed', 20],
    ['short', 'limit', 'cancelled', null],
    ['short', 'market', 'closed', -4.9],
  ]);

  await page.getByRole('button', { name: 'Nueva práctica' }).click();
  await expect(page.getByRole('cell', { name: 'PAXGUSDT · 1h' })).toBeVisible();

  // An admin sees the session and its trades.
  await signOut(page);
  await signIn(page, 'admin@indab.test');
  await nav(page).getByRole('link', { name: 'Administración' }).click();
  await page.getByRole('link', { name: 'Revisar prácticas de trading' }).click();
  await expect(page).toHaveURL('/admin/practice');
  await expect(page.getByRole('cell', { name: 'José Pérez' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver operaciones' }).click();
  await expect(page.getByRole('cell', { name: 'Fin de sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Manual', exact: true })).toBeVisible();
});
