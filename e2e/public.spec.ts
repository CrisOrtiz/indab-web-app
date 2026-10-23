import { expect, test } from '@playwright/test';
import { resetEmulators } from './emulators';
import { nav } from './helpers';

test.beforeEach(resetEmulators);

test('the landing page invites visitors to join', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('INDAB Academy');
  await expect(page.getByRole('heading', { name: 'INDAB Academy' })).toBeVisible();
  await expect(
    page.getByText('Conocimiento. Disciplina. Estrategia. Resultados.').first(),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Únete a la academia' }).click();
  await expect(page).toHaveURL('/register');
  await expect(page).toHaveTitle('Crear cuenta | INDAB');
});

test('the landing page shows its sections and links to Eleva', async ({ page }) => {
  await page.goto('/');
  for (const name of [
    'Formamos traders con método',
    'Programas por niveles',
    'Un proceso en cuatro pasos',
    'Todo tu aprendizaje en un solo lugar',
    'Lo que dicen nuestros estudiantes',
    'Resolvemos tus dudas',
    'Hablemos',
  ]) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await page.getByText('¿Necesito experiencia previa?').click();
  await expect(page.getByText('El Nivel 1 parte desde cero')).toBeVisible();
  await expect(page.getByText('Aviso de riesgo:')).toBeVisible();
  await page.getByRole('link', { name: 'Conoce Eleva Inversiones' }).click();
  await expect(page).toHaveURL('/eleva');
});

test('visitors see Eleva and the login link, not private sections', async ({ page }) => {
  await page.goto('/eleva');
  await expect(page).toHaveTitle('Eleva Inversiones');
  await expect(nav(page).getByRole('link', { name: 'Ingresar' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Academia' })).toHaveCount(0);
  await expect(nav(page).getByRole('link', { name: 'Administración' })).toHaveCount(0);
});

for (const path of ['/academy', '/repository', '/admin']) {
  test(`${path} sends visitors to the login page`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(`/login?returnUrl=${encodeURIComponent(path)}`);
    await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
  });
}

test('unknown pages show the not-found page', async ({ page }) => {
  await page.goto('/no-existe');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page).toHaveURL('/');
});
