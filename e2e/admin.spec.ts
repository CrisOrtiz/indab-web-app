import { Page, expect, test } from '@playwright/test';
import { createUser, getDocument, resetEmulators } from './emulators';
import { nav, signIn, signOut } from './helpers';

let adminUid: string;
let studentUid: string;

test.beforeEach(async () => {
  await resetEmulators();
  adminUid = await createUser('Ana Admin', 'admin@indab.test', { role: 'admin' });
  studentUid = await createUser('Luis Díaz', 'luis@indab.test');
  await createUser('José Pérez', 'jose@indab.test', { academy: true });
});

const row = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });
const openAdmin = async (page: Page) => {
  await signIn(page, 'admin@indab.test', '/login?returnUrl=%2Fadmin');
  await expect(page).toHaveURL('/admin');
  await expect(page.getByText('3 de 3 usuarios')).toBeVisible();
};

test('students cannot open the admin area', async ({ page }) => {
  await signIn(page, 'luis@indab.test');
  await expect(nav(page).getByRole('link', { name: 'Administración' })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page).toHaveURL('/academy');
});

test('admins see every user with search and filters', async ({ page }) => {
  await openAdmin(page);
  await expect(nav(page).getByRole('link', { name: 'Administración' })).toBeVisible();
  await expect(page.locator('.stat strong')).toHaveText(['3', '1', '1']);

  await page.getByLabel('Buscar usuarios').fill('jose');
  await expect(page.getByText('1 de 3 usuarios')).toBeVisible();
  await expect(row(page, 'José Pérez')).toBeVisible();

  await page.getByLabel('Buscar usuarios').fill('');
  await page.getByLabel('Filtrar por acceso').selectOption('pending');
  await expect(page.getByText('2 de 3 usuarios')).toBeVisible();
  await page.getByLabel('Filtrar por rol').selectOption('admin');
  await expect(page.getByText('1 de 3 usuarios')).toBeVisible();
  await expect(row(page, 'Ana Admin')).toBeVisible();
});

test('admins cannot change their own role', async ({ page }) => {
  await openAdmin(page);
  await expect(page.getByLabel('Rol de Ana Admin')).toBeDisabled();
  await expect(row(page, 'Ana Admin').getByText('Tú')).toBeVisible();
});

test('granting academy access opens the material to the student', async ({ page }) => {
  await openAdmin(page);
  await row(page, 'Luis Díaz').getByRole('checkbox').check();
  await expect(page.getByRole('status')).toContainText(
    'Luis Díaz ahora tiene acceso a la academia.',
  );
  expect(await getDocument(`enrollments/${studentUid}`)).toMatchObject({
    academy: true,
    courses: [],
    updatedBy: adminUid,
  });

  await signOut(page);
  await signIn(page, 'luis@indab.test');
  await expect(page.getByText('Bienvenido a la academia.')).toBeVisible();
  await page.getByRole('link', { name: 'Ver material de estudio' }).click();
  await expect(page).toHaveURL('/repository');
});

test('revoking academy access closes the material again', async ({ page }) => {
  await openAdmin(page);
  await row(page, 'José Pérez').getByRole('checkbox').uncheck();
  await expect(page.getByRole('status')).toContainText(
    'Se quitó el acceso a la academia a José Pérez.',
  );

  await signOut(page);
  await signIn(page, 'jose@indab.test');
  await expect(page.getByText('Tu inscripción está pendiente.')).toBeVisible();
  await page.goto('/repository');
  await expect(page).toHaveURL('/academy');
});

test('promoting a student asks for confirmation', async ({ page }) => {
  await openAdmin(page);

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByLabel('Rol de Luis Díaz').selectOption('admin');
  await expect(page.getByLabel('Rol de Luis Díaz')).toHaveValue('student');
  expect(await getDocument(`users/${studentUid}`)).toMatchObject({ role: 'student' });

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toBe('¿Dar permisos de administrador a Luis Díaz?');
    return dialog.accept();
  });
  await page.getByLabel('Rol de Luis Díaz').selectOption('admin');
  await expect(page.getByRole('status')).toContainText('Luis Díaz ahora es administrador.');
  await expect(page.locator('.stat strong').nth(2)).toHaveText('2');
  expect(await getDocument(`users/${studentUid}`)).toMatchObject({ role: 'admin' });

  // The new admin can open the admin area and the material.
  await signOut(page);
  await signIn(page, 'luis@indab.test');
  await expect(nav(page).getByRole('link', { name: 'Material' })).toBeVisible();
  await nav(page).getByRole('link', { name: 'Administración' }).click();
  await expect(page).toHaveURL('/admin');
});
