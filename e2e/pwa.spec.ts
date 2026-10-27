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

test.describe('on iPhone', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true });

  test('visitors get Add to Home Screen instructions from the footer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Instalar app' }).click();
    const dialog = page.getByRole('dialog', { name: 'Instala la app de INDAB' });
    await expect(dialog).toContainText('Toca el botón Compartir');
    await expect(dialog).toContainText('Elige «Agregar a inicio».');
    await dialog.getByRole('button', { name: 'Entendido' }).click();
    await expect(dialog).toBeHidden();
  });
});

test('signed-in users install the app from the account menu', async ({ page }) => {
  // Chromium fires its install prompt only for a served, installable build; fake it here.
  await page.addInitScript(() => {
    const w = window as unknown as { prompted: boolean };
    w.prompted = false;
    addEventListener('load', () => {
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => void (w.prompted = true),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      dispatchEvent(event);
    });
  });
  await createUser('Ana Pérez', 'ana@indab.test');
  await signIn(page, 'ana@indab.test');
  await expect(page).toHaveURL('/academy');

  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Instalar app' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { prompted: boolean }).prompted))
    .toBe(true);
  // Installed: the option is gone from the menu and the footer.
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await expect(page.getByRole('menuitem', { name: 'Instalar app' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
});
