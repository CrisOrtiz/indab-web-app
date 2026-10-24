import { expect, test } from '@playwright/test';
import { resetEmulators } from './emulators';
import { nav } from './helpers';

test.beforeEach(resetEmulators);

test('the logo loader covers the page until it is ready', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'INDAB Academy' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Cargando…' })).toHaveCount(0);
  await expect(page.locator('#boot-loader')).toHaveCount(0);
});

test('the logo loader shows while a slow page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  // Hold the next lazy page so the navigation takes a while.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/chunk-.*\.js$|\/login.*\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  await nav(page).getByRole('link', { name: 'Ingresar' }).click();
  await expect(page.getByRole('progressbar', { name: 'Cargando…' })).toBeVisible();
  release();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

test('the site has favicons and an app manifest made from the logo', async ({ page, request }) => {
  await page.goto('/');
  for (const href of [
    'favicon.ico',
    'favicon-32.png',
    'favicon-16.png',
    'apple-touch-icon.png',
    'manifest.webmanifest',
  ]) {
    await expect(page.locator(`head link[href="${href}"]`)).toHaveCount(1);
    expect((await request.get(`/${href}`)).ok()).toBe(true);
  }
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  for (const icon of manifest.icons) {
    expect((await request.get(`/${icon.src}`)).ok()).toBe(true);
  }
});
