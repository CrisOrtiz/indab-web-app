import { Page, expect, test } from '@playwright/test';
import { createUser, resetEmulators, setDocument } from './emulators';
import { signIn } from './helpers';
import { mockMarket } from './market';

const DAY = 24 * 60 * 60 * 1000;

/** Seeds `count` sessions of a student, one a day back from today, every third one active. */
async function seedSessions(uid: string, userName: string, count: number, prefix: string) {
  for (let i = 0; i < count; i++) {
    await setDocument(`practiceSessions/${prefix}${i}`, {
      uid,
      userName,
      symbol: 'XAUUSDT',
      interval: '15m',
      replayStart: 1_770_000_000_000,
      startingBalance: 200,
      balance: 200 + i,
      pnl: i,
      tradeCount: 2,
      status: i % 3 === 0 ? 'active' : 'finished',
      startedAt: new Date(Date.now() - i * DAY),
      evaluationId: null,
    });
  }
}

/** The newest active session opens again on the practice page: end it to see the lists. */
async function endResumedSession(page: Page) {
  await page.getByRole('button', { name: 'Terminar sesión' }).click();
  await page.getByRole('button', { name: 'Nueva práctica' }).click();
}

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  await createUser('Ana Admin', 'admin@indab.test', { role: 'admin' });
  const jose = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  const luis = await createUser('Luis Díaz', 'luis@indab.test', { academy: true });
  await seedSessions(jose, 'José Pérez', 25, 'j');
  await seedSessions(luis, 'Luis Díaz', 3, 'l');
  await mockMarket(page);
});

test('staff filter the practice review and page through it', async ({ page }) => {
  const rows = page.locator('table.sessions > tbody > tr');
  const pager = page.getByRole('navigation', { name: 'Páginas de la lista' });
  await signIn(page, 'admin@indab.test');
  await expect(page).toHaveURL('/academy');
  await page.goto('/admin/practice');
  await expect(rows).toHaveCount(20);
  await expect(page.locator('.stat strong')).toHaveText(['28', '56']);
  await expect(pager).toContainText('Página 1');

  await pager.getByRole('button', { name: 'Siguiente' }).click();
  await expect(pager).toContainText('Página 2');
  await expect(rows).toHaveCount(8);
  await expect(pager.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  await pager.getByRole('button', { name: 'Anterior' }).click();
  await expect(rows).toHaveCount(20);

  await page.getByLabel('Estudiante').selectOption({ label: 'Luis Díaz' });
  await expect(rows).toHaveCount(3);
  await expect(page.locator('.stat strong')).toHaveText(['3', '6']);
  await expect(pager).toHaveCount(0);

  await page.getByLabel('Estado').selectOption({ label: 'En curso' });
  await expect(rows).toHaveCount(1);
  await page.getByLabel('Tipo').selectOption({ label: 'Práctica libre' });
  await expect(rows).toHaveCount(1);

  // Only sessions started in the last two days (today and yesterday).
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  const day = (offset: number) => new Date(Date.now() - offset * DAY).toLocaleDateString('sv');
  await page.getByLabel('Desde').fill(day(1));
  await expect(rows).toHaveCount(4);
  await expect(page.locator('.stat strong').first()).toHaveText('4');
});

test('a student pages and filters their own sessions', async ({ page }) => {
  const rows = page.locator('table.trades > tbody > tr');
  const pager = page.getByRole('navigation', { name: 'Páginas de la lista' });
  await signIn(page, 'jose@indab.test');
  await expect(page).toHaveURL('/academy');
  await page.goto('/academy/practice');
  await endResumedSession(page);
  await expect(rows).toHaveCount(10);
  await expect(page.getByLabel('Estudiante')).toHaveCount(0);

  await pager.getByRole('button', { name: 'Siguiente' }).click();
  await pager.getByRole('button', { name: 'Siguiente' }).click();
  await expect(pager).toContainText('Página 3');
  await expect(rows).toHaveCount(5);

  await page.getByLabel('Estado').selectOption({ label: 'En curso' });
  // Sessions 3, 6, ..., 24 are still active (0 was picked up and finished): 8, on one page.
  await expect(rows).toHaveCount(8);
  await expect(pager).toHaveCount(0);
});

test('the date filters fit side by side on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'jose@indab.test');
  await expect(page).toHaveURL('/academy');
  await page.goto('/academy/practice');
  await endResumedSession(page);
  const from = (await page.getByLabel('Desde').boundingBox())!;
  const to = (await page.getByLabel('Hasta').boundingBox())!;
  // One row, a gap between them and both inside the screen.
  expect(Math.abs(from.y - to.y)).toBeLessThan(1);
  expect(to.x - (from.x + from.width)).toBeGreaterThanOrEqual(8);
  expect(from.x).toBeGreaterThanOrEqual(0);
  expect(to.x + to.width).toBeLessThanOrEqual(390);
});
