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

test('visitors open the economic calendar from the header, without a way back', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Calendario' }).click();
  await expect(page).toHaveURL('/calendar');
  await expect(page.getByRole('heading', { name: 'Calendario económico', level: 1 })).toBeVisible();
  await expect
    .poll(() => widgetSettings(page))
    .toMatchObject({ countryFilter: 'us,jp', importanceFilter: '1', locale: 'es' });
  await expect(page.getByRole('link', { name: '← Academia' })).toHaveCount(0);
});

test('students open the calendar from the academy, filter it and go back', async ({ page }) => {
  await createUser('José Pérez', 'jose@indab.test', { academy: true });
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Calendario económico' }).click();
  await expect(page).toHaveURL('/academy/calendar');
  await expect(page.getByRole('heading', { name: 'Calendario económico', level: 1 })).toBeVisible();
  await expect
    .poll(() => widgetSettings(page))
    .toMatchObject({ countryFilter: 'us,jp', locale: 'es' });

  await page.getByLabel('China').check();
  await page.getByLabel('Medio', { exact: true }).check();
  await page.getByLabel('Bajo', { exact: true }).check();
  // The widget is rebuilt on the next render, not during the click.
  await expect
    .poll(() => widgetSettings(page))
    .toMatchObject({ countryFilter: 'us,jp,cn', importanceFilter: '-1,0,1' });
  await expect(page.getByRole('heading', { name: 'USD/JPY' })).toBeVisible();

  await page.getByRole('link', { name: '← Academia' }).click();
  await expect(page).toHaveURL('/academy');
});

test('students without access can still open the public calendar', async ({ page }) => {
  await createUser('Luis Díaz', 'luis@indab.test');
  await signIn(page, 'luis@indab.test');
  await expect(page).toHaveURL('/academy');
  await page.getByRole('link', { name: 'Calendario económico' }).click();
  await expect(page).toHaveURL('/academy/calendar');
  await expect(page.getByRole('heading', { name: 'Calendario económico', level: 1 })).toBeVisible();
});
