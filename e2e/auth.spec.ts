import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  confirmEmail,
  createUser,
  getDocument,
  resetEmulators,
  uidOf,
} from './emulators';
import { nav, signIn, signOut } from './helpers';

test.beforeEach(resetEmulators);

test('a new visitor registers, confirms their email and lands in the academy as a pending student', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Nombre completo').fill('María Fernández');
  await page.getByLabel('Correo electrónico').fill('maria@indab.test');
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByLabel('Fecha de nacimiento').fill('1996-02-29');
  await page.getByLabel('WhatsApp (opcional)').fill('+52 55 1234 5678');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // The academy waits until the email is confirmed.
  await expect(page).toHaveURL('/account-setup');
  await expect(page.getByRole('heading', { name: 'Confirma tu correo' })).toBeVisible();
  await expect(page.getByText('Te enviamos un enlace a maria@indab.test.')).toBeVisible();
  await page.getByRole('button', { name: 'Ya lo confirmé' }).click();
  await expect(page.getByRole('alert')).toContainText('Todavía no vemos la confirmación.');
  await page.goto('/academy');
  await expect(page).toHaveURL('/account-setup?returnUrl=%2Facademy');

  await confirmEmail('maria@indab.test');
  await page.getByRole('button', { name: 'Ya lo confirmé' }).click();
  await expect(page).toHaveURL('/academy');
  await expect(page.getByRole('heading', { name: 'Hola, María Fernández' })).toBeVisible();
  await expect(page.getByText('Tu inscripción está pendiente.')).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Administración' })).toHaveCount(0);

  const uid = await uidOf('maria@indab.test');
  expect(await getDocument(`users/${uid}`)).toMatchObject({
    uid,
    email: 'maria@indab.test',
    displayName: 'María Fernández',
    role: 'student',
    birthDate: '1996-02-29',
    whatsapp: '+525512345678',
  });
  expect(await getDocument(`enrollments/${uid}`)).toBeNull();

  // Pending students cannot open the material, even by URL.
  await page.goto('/academy/material');
  await expect(page).toHaveURL('/academy');
});

test('registration validates the form and rejects a taken email', async ({ page }) => {
  await createUser('Ana', 'ana@indab.test');
  await page.goto('/register');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Ingresa tu nombre.')).toBeVisible();
  await expect(page.getByText('Ingresa un correo válido.')).toBeVisible();

  await expect(page.getByText('Ingresa tu fecha de nacimiento.')).toBeVisible();

  await page.getByLabel('Nombre completo').fill('Otra Ana');
  await page.getByLabel('Correo electrónico').fill('ana@indab.test');
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByLabel('Fecha de nacimiento').fill('1990-01-01');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('alert')).toHaveText('Ya existe una cuenta con este correo.');
  await expect(page).toHaveURL('/register');
});

test('login rejects a wrong password', async ({ page }) => {
  await createUser('Ana', 'ana@indab.test');
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('ana@indab.test');
  await page.getByLabel('Contraseña').fill('incorrecta');
  await page.locator('form').getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.');
  await expect(page).toHaveURL('/login');
});

test('login returns to the page the visitor asked for', async ({ page }) => {
  await createUser('Ana', 'ana@indab.test', { academy: true });
  await page.goto('/academy/material');
  await expect(page).toHaveURL('/login?returnUrl=%2Facademy%2Fmaterial');
  await signIn(page, 'ana@indab.test', page.url());
  await expect(page).toHaveURL('/academy/material');
  await expect(page.getByRole('heading', { name: 'Material de estudio' })).toBeVisible();
});

test('the session survives a reload and ends on sign-out', async ({ page }) => {
  await createUser('Ana', 'ana@indab.test');
  await signIn(page, 'ana@indab.test');
  await expect(page).toHaveURL('/academy');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
  await page.goto('/login');
  await expect(page).toHaveURL('/academy');

  await signOut(page);
  await expect(nav(page).getByRole('link', { name: 'Ingresar' })).toBeVisible();
  await page.goto('/academy');
  await expect(page).toHaveURL('/login?returnUrl=%2Facademy');
});

test('password reset asks for the email and confirms the send', async ({ page }) => {
  await createUser('Ana', 'ana@indab.test');
  await page.goto('/login');
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Escribe tu correo para recuperar la contraseña.',
  );
  await page.getByLabel('Correo electrónico').fill('ana@indab.test');
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Te enviamos un correo para restablecer tu contraseña.',
  );
});

test('an unconfirmed student confirms their email and goes on to the page they asked for', async ({
  page,
}) => {
  await createUser('Ana', 'ana@indab.test', { academy: true, verified: false });
  await page.goto('/academy/material');
  await signIn(page, 'ana@indab.test', page.url());
  await expect(page).toHaveURL('/account-setup?returnUrl=%2Facademy%2Fmaterial');
  await page.getByRole('button', { name: 'Reenviar correo' }).click();
  await expect(page.getByRole('status')).toHaveText('Te enviamos otro correo.');

  // The rules read the confirmation from the session token, so the material only loads if the
  // app refreshed it.
  await confirmEmail('ana@indab.test');
  await page.getByRole('button', { name: 'Ya lo confirmé' }).click();
  await expect(page).toHaveURL('/academy/material');
  await expect(page.getByRole('heading', { name: 'Material de estudio' })).toBeVisible();
});

test('an account without a birth date is asked for it once', async ({ page }) => {
  const uid = await createUser('Ana', 'ana@indab.test', { birthDate: null });
  await signIn(page, 'ana@indab.test');
  await expect(page).toHaveURL('/account-setup?returnUrl=%2Facademy');
  await expect(page.getByRole('heading', { name: 'Completa tus datos' })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page.getByText('Ingresa tu fecha de nacimiento.')).toBeVisible();

  await page.getByLabel('Fecha de nacimiento').fill('1988-09-10');
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page).toHaveURL('/academy');
  expect(await getDocument(`users/${uid}`)).toMatchObject({ birthDate: '1988-09-10' });
  expect(await getDocument(`users/${uid}`)).not.toHaveProperty('whatsapp');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
});
