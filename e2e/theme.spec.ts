import { Page, expect, test } from '@playwright/test';
import { createUser, resetEmulators } from './emulators';
import { signIn } from './helpers';

const theme = (page: Page) => page.locator('html').getAttribute('data-theme');
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.beforeEach(resetEmulators);

test('visitors get the theme of their device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('rgb(18, 18, 18)');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => theme(page)).toBe('light');
  expect(await background(page)).toBe('rgb(255, 255, 255)');
});

test('a signed-in user picks dark mode in the account menu and it stays', async ({ page }) => {
  await createUser('Ana Pérez', 'ana@indab.test');
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn(page, 'ana@indab.test');
  await expect(page).toHaveURL('/academy');

  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitemradio', { name: 'Sistema' })).toBeChecked();
  await menu.getByRole('menuitemradio', { name: 'Oscuro' }).click();
  await expect(menu.getByRole('menuitemradio', { name: 'Oscuro' })).toBeChecked();
  expect(await theme(page)).toBe('dark');
  expect(await background(page)).toBe('rgb(18, 18, 18)');

  // The choice is set before the app starts, on public pages too, whatever the device says.
  await page.goto('/');
  expect(await theme(page)).toBe('dark');
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe('dark');

  await page.goto('/academy');
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('menuitemradio', { name: 'Claro' }).click();
  expect(await theme(page)).toBe('light');
  expect(await background(page)).toBe('rgb(255, 255, 255)');
});
