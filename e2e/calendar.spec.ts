import { Page, expect, test } from '@playwright/test';
import { createUser, resetEmulators } from './emulators';
import { signIn } from './helpers';

const WIDGET = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  // Stand-in for TradingView's script, which tests must not download.
  await page.route(WIDGET, (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
});

const widgetSettings = (page: Page) =>
  page.locator(`script[src="${WIDGET}"]`).evaluate((s) => JSON.parse(s.textContent ?? ''));

test('students open the economic calendar from the academy and filter it', async ({ page }) => {
  await createUser('José Pérez', 'jose@indab.test', { academy: true });
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Calendario económico' }).click();
  await expect(page).toHaveURL('/academy/calendar');
  await expect(page.getByRole('heading', { name: 'Calendario económico', level: 1 })).toBeVisible();
  expect(await widgetSettings(page)).toMatchObject({ countryFilter: 'us,jp', locale: 'es' });

  await page.getByLabel('China').check();
  await page.getByLabel('Impacto').selectOption({ label: 'Medio y alto' });
  expect(await widgetSettings(page)).toMatchObject({
    countryFilter: 'us,jp,cn',
    importanceFilter: '0,1',
  });
  await expect(page.getByRole('heading', { name: 'USD/JPY' })).toBeVisible();
});

test('students without access cannot open the calendar', async ({ page }) => {
  await createUser('Luis Díaz', 'luis@indab.test');
  await signIn(page, 'luis@indab.test');
  await expect(page).toHaveURL('/academy');
  await page.goto('/academy/calendar');
  await expect(page).toHaveURL('/academy');
});
