import { expect, test } from '@playwright/test';
import { createUser, resetEmulators } from './emulators';
import { signIn } from './helpers';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test.beforeEach(resetEmulators);

test('the site links a manifest for an installable app', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(`/${href}`)).json();
  expect(manifest).toMatchObject({ short_name: 'INDAB', display: 'standalone', start_url: '/' });
  expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toContain('maskable');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    'apple-touch-icon.png',
  );
  // Browsers without an install prompt (and not iOS) get no option.
  await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
});

// "Install app" is switched off for now (INSTALL_OFFER_ENABLED, Cris 2026-10-27): neither iPhone
// visitors nor browsers with an install prompt get the option.
test.describe('on iPhone', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true });

  test('visitors get no install option', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-footer')).toContainText('Desarrollado por');
    await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
  });
});

test('signed-in users get no install option in the account menu', async ({ page }) => {
  // Chromium fires its install prompt only for a served, installable build; fake it here.
  await page.addInitScript(() => {
    addEventListener('load', () => {
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => undefined,
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      dispatchEvent(event);
    });
  });
  await createUser('Ana Pérez', 'ana@indab.test');
  await signIn(page, 'ana@indab.test');
  await expect(page).toHaveURL('/academy');

  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await expect(page.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Instalar app' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
});
