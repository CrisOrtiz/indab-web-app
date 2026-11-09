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
  await page.getByRole('link', { name: /Usuarios/ }).click();
  await expect(page).toHaveURL('/admin/users');
  await expect(page.getByText('3 de 3 usuarios')).toBeVisible();
};

test('students cannot open the admin area', async ({ page }) => {
  await signIn(page, 'luis@indab.test');
  await expect(page).toHaveURL('/academy');
  await expect(nav(page).getByRole('link', { name: 'Administración' })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page).toHaveURL('/academy');
  await page.goto('/admin/users');
  await expect(page).toHaveURL('/academy');
});

test('trainers see only students, grant academy access and cannot change roles', async ({
  page,
}) => {
  const trainerUid = await createUser('Marta Ruiz', 'marta@indab.test', { role: 'trainer' });
  await signIn(page, 'marta@indab.test', '/login?returnUrl=%2Fadmin');
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('link', { name: /Usuarios/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Estudiantes/ }).click();
  await expect(page).toHaveURL('/admin/users');
  await expect(page.getByRole('heading', { name: 'Estudiantes' })).toBeVisible();
  await expect(page.getByText('2 de 2 usuarios')).toBeVisible();
  await expect(row(page, 'Ana Admin')).toHaveCount(0);
  await expect(row(page, 'Marta Ruiz')).toHaveCount(0);
  await expect(page.getByLabel('Rol de Luis Díaz')).toHaveCount(0);

  // Access already given can only be taken away by an admin.
  await expect(row(page, 'José Pérez').getByRole('checkbox')).toBeDisabled();
  await row(page, 'Luis Díaz').getByRole('checkbox').check();
  await expect(page.getByRole('status')).toContainText(
    'Luis Díaz ahora tiene acceso a la academia.',
  );
  expect(await getDocument(`enrollments/${studentUid}`)).toMatchObject({
    academy: true,
    courses: [],
    updatedBy: trainerUid,
  });
  await expect(row(page, 'Luis Díaz').getByRole('checkbox')).toBeDisabled();
});

test('admins see every user with search and filters', async ({ page }) => {
  await openAdmin(page);
  await expect(nav(page).getByRole('link', { name: 'Administración' })).toBeVisible();
  await expect(page.locator('.stat strong')).toHaveText(['3', '1', '0', '1']);

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
  await page.getByRole('link', { name: 'Material de estudio' }).click();
  await expect(page).toHaveURL('/academy/material');
});

test('revoking academy access closes the material again', async ({ page }) => {
  await openAdmin(page);
  // The access column fills in after the list: wait for it before changing it.
  const access = row(page, 'José Pérez').getByRole('checkbox');
  await expect(access).toBeChecked();
  await access.uncheck();
  await expect(page.getByRole('status')).toContainText(
    'Se quitó el acceso a la academia a José Pérez.',
  );

  await signOut(page);
  await signIn(page, 'jose@indab.test');
  await expect(page.getByText('Tu inscripción está pendiente.')).toBeVisible();
  await page.goto('/academy/material');
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
  await expect(page.locator('.stat strong').nth(3)).toHaveText('2');
  expect(await getDocument(`users/${studentUid}`)).toMatchObject({ role: 'admin' });

  // The new admin can open the admin area.
  await signOut(page);
  await signIn(page, 'luis@indab.test');
  await nav(page).getByRole('link', { name: 'Administración' }).click();
  await expect(page).toHaveURL('/admin');
});

test('trainers keep the economic news calendar the practice chart shows', async ({ page }) => {
  await createUser('Marta Ruiz', 'marta@indab.test', { role: 'trainer' });
  await signIn(page, 'marta@indab.test', '/login?returnUrl=%2Fadmin');
  await expect(page).toHaveURL('/admin');
  await page.getByRole('link', { name: /Noticias económicas/ }).click();
  await expect(page).toHaveURL('/admin/news');

  // The official dates load once; loading them again adds nothing.
  await page.getByRole('button', { name: 'Cargar fechas oficiales 2026' }).click();
  await expect(page.getByRole('status')).toContainText(/Se agregaron \d+ noticias\./);
  await page.locator('input[type="month"]').fill('2026-12');
  await expect(page.locator('.news-row').filter({ hasText: 'FOMC' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Cargar fechas oficiales 2026' }).click();
  await expect(page.getByRole('status')).toContainText('Las fechas oficiales ya estaban cargadas.');

  // Staff add a release of their own and write its figure later.
  await page.getByRole('button', { name: 'Agregar noticia' }).click();
  await page.getByLabel('Nombre').fill('Discurso de Powell');
  await page.getByLabel('Fecha y hora (tu zona horaria)').fill('2026-12-01T10:00');
  await page.getByLabel('Impacto').selectOption('medium');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Noticia guardada.');
  const powell = page.locator('.news-row').filter({ hasText: 'Discurso de Powell' });
  await expect(powell).toContainText('Impacto medio');
  await powell.getByRole('button', { name: 'Acciones: Discurso de Powell' }).click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await page.getByLabel('Actual').fill('Hawkish');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(powell).toContainText('Actual: Hawkish');
});
