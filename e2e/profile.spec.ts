import { Page, expect, test } from '@playwright/test';
import {
  PASSWORD,
  createUser,
  getDocument,
  listDocuments,
  resetEmulators,
  setDocument,
} from './emulators';
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
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(page.getByRole('status')).toHaveText('Datos actualizados.');
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

test('students edit their birth date and WhatsApp', async ({ page }) => {
  const uid = await createUser('Ana Pérez', 'ana@indab.test');
  await signIn(page, 'ana@indab.test');
  await openProfile(page);
  await expect(page.getByLabel('Fecha de nacimiento')).toHaveValue('1990-05-15');

  await page.getByLabel('WhatsApp (opcional)').fill('912345678');
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(page.getByText('Escribe el número con el código de país')).toBeVisible();

  await page.getByLabel('Fecha de nacimiento').fill('1991-06-16');
  await page.getByLabel('WhatsApp (opcional)').fill('+56 9 1234 5678');
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(page.getByRole('status')).toHaveText('Datos actualizados.');
  await expect
    .poll(async () => getDocument(`users/${uid}`))
    .toMatchObject({ birthDate: '1991-06-16', whatsapp: '+56912345678' });
});

test('students see their open sessions and sign out another device', async ({ browser, page }) => {
  const uid = await createUser('Ana Pérez', 'ana@indab.test');
  const phone = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  await signIn(phone, 'ana@indab.test');
  await expect(phone).toHaveURL('/academy');

  await signIn(page, 'ana@indab.test');
  await openProfile(page);
  const sessions = page.locator('.sessions li');
  await expect(sessions).toHaveCount(2);
  await expect(sessions.first()).toContainText('Este dispositivo');
  await expect(sessions.nth(1)).toContainText('Safari en iOS');
  await expect(sessions.nth(1)).toContainText('Celular o tableta');

  await sessions.nth(1).getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Listo. Ese dispositivo se cerrará apenas se conecte.',
  );
  // The phone notices, signs itself out and leaves the list.
  await expect(phone).toHaveURL('/login?ended=1');
  await expect(phone.getByRole('status')).toContainText(
    'Cerraste esta sesión desde otro dispositivo.',
  );
  await expect(sessions).toHaveCount(1);
  await phone.goto('/academy');
  await expect(phone).toHaveURL('/login?returnUrl=%2Facademy');
  await phone.close();

  // Signing out here removes this browser too.
  await signOut(page);
  await expect.poll(async () => listDocuments(`users/${uid}/sessions`)).toEqual([]);
});
