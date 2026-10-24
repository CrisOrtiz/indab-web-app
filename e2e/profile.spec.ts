import { Page, expect, test } from '@playwright/test';
import { PASSWORD, createUser, getDocument, resetEmulators, setDocument } from './emulators';
import { signIn, signOut } from './helpers';

// A 2×1 PNG: the app crops it to a square and stores it as a small JPEG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGM4IQcEJwAHIwIJ5FiIOQAAAABJRU5ErkJggg==',
  'base64',
);

const accountButton = (page: Page) => page.getByRole('button', { name: 'Tu cuenta' });

async function openProfile(page: Page): Promise<void> {
  await accountButton(page).click();
  await page.getByRole('menuitem', { name: 'Mi perfil' }).click();
  await expect(page).toHaveURL('/profile');
  await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible();
}

test.beforeEach(resetEmulators);

test('the avatar menu opens the profile, where students edit their name and photo', async ({
  page,
}) => {
  const uid = await createUser('Ana Pérez', 'ana@indab.test');
  await signIn(page, 'ana@indab.test');
  await expect(page).toHaveURL('/academy');
  await expect(accountButton(page)).toHaveText('AP');

  await openProfile(page);
  await expect(page.getByText('Pendiente de activación')).toBeVisible();

  await page.getByLabel('Nombre completo').fill('Ana María Pérez');
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(page.getByRole('status')).toHaveText('Nombre actualizado.');
  await accountButton(page).click();
  await expect(page.getByRole('menu')).toContainText('Ana María Pérez');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect
    .poll(async () => (await getDocument(`users/${uid}`))?.['displayName'])
    .toBe('Ana María Pérez');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByRole('status')).toHaveText('Foto actualizada.');
  await expect(accountButton(page).locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
  expect(String((await getDocument(`users/${uid}`))?.['photoURL'])).toMatch(
    /^data:image\/jpeg;base64,/,
  );

  await page.getByRole('button', { name: 'Quitar foto' }).click();
  await expect(page.getByRole('status')).toHaveText('Foto eliminada.');
  await expect(accountButton(page)).toHaveText('AP');
  expect((await getDocument(`users/${uid}`))?.['photoURL']).toBeUndefined();

  await signOut(page);
});

test('students change their password and sign in with the new one', async ({ page }) => {
  await createUser('Ana Pérez', 'ana@indab.test');
  await signIn(page, 'ana@indab.test');
  await openProfile(page);

  await page.getByLabel('Contraseña actual').fill('incorrecta');
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('nueva-clave-1');
  await page.getByLabel('Repite la nueva contraseña').fill('nueva-clave-1');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');

  await page.getByLabel('Contraseña actual').fill(PASSWORD);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('status')).toHaveText('Contraseña actualizada.');

  await signOut(page);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('ana@indab.test');
  await page.getByLabel('Contraseña').fill('nueva-clave-1');
  await page.locator('form').getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL('/academy');
});

// Linking a password to a Google-only account is covered by the unit tests: the emulator's
// Google window loads the auth iframe from `authDomain`, which needs internet access.

test('the profile sums up the practice P/L', async ({ page }) => {
  const uid = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  const session = (pnl: number, tradeCount: number, day: number) => ({
    uid,
    userName: 'José Pérez',
    symbol: 'PAXGUSDT',
    interval: '15m',
    replayStart: 0,
    startingBalance: 200,
    balance: 200 + pnl,
    pnl,
    tradeCount,
    status: 'finished',
    startedAt: new Date(Date.UTC(2026, 9, day, 12)),
  });
  await setDocument('practiceSessions/s1', session(25.5, 4, 20));
  await setDocument('practiceSessions/s2', session(-10.25, 3, 21));
  await signIn(page, 'jose@indab.test');
  await expect(page).toHaveURL('/academy');
  await openProfile(page);

  await expect(page.locator('.stats')).toContainText('+15.25 USD');
  await expect(page.locator('.stats')).toContainText('1 / 2');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  // Latest first.
  await expect(page.locator('tbody tr').first()).toContainText('-10.25');
});

test('the profile needs a signed-in user', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL('/login?returnUrl=%2Fprofile');
});
