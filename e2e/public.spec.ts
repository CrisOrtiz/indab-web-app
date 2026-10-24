import { expect, test } from '@playwright/test';
import { resetEmulators } from './emulators';
import { nav } from './helpers';

test.beforeEach(resetEmulators);

test('the landing page invites visitors to join', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('INDAB Academy | Academia de trading');
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
  await expect(page).toHaveTitle('Eleva Inversiones | INDAB');
  await expect(nav(page).getByRole('link', { name: 'Ingresar' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Academia' })).toHaveCount(0);
  await expect(nav(page).getByRole('link', { name: 'Administración' })).toHaveCount(0);
});

for (const path of ['/academy', '/academy/material', '/admin']) {
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

test('visitors can switch the site to English or Portuguese, and it stays that way', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
  await page.getByRole('button', { name: 'Idioma: Español' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Español' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('link', { name: 'Join the academy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Programs by level' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Programs by level' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  await expect(page).toHaveTitle('Sign in | INDAB');
  await expect(page.getByLabel('Password')).toBeVisible();

  await page.getByRole('button', { name: 'Language: English' }).click();
  await page.getByRole('menuitemradio', { name: 'Português' }).click();
  await expect(page.getByRole('button', { name: 'Idioma: Português' })).toBeVisible();
  await expect(page).toHaveTitle('Entrar | INDAB');
  await expect(page.getByLabel('Senha')).toBeVisible();
});

test('the header stays on top while scrolling and marks the current section', async ({ page }) => {
  await page.goto('/eleva');
  const header = page.locator('app-header');
  await expect(page.getByRole('link', { name: 'Eleva Inversiones' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.goto('/');
  await expect(header).not.toHaveClass(/scrolled/);
  await page.mouse.wheel(0, 1200);
  await expect(header).toHaveClass(/scrolled/);
  const box = await header.boundingBox();
  expect(box?.y).toBe(0);
  await expect(page.getByRole('link', { name: 'INDAB Academy' })).toBeInViewport();
});

test('a ?lang= link opens the site in that language for the visit only', async ({ page }) => {
  await page.goto('/?lang=pt');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page).toHaveTitle('INDAB Academy | Academia de trading');
  await expect(page.getByRole('link', { name: 'Entre na academia' })).toBeVisible();

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-419');
});

test('public pages describe themselves to search engines; private ones are noindex', async ({
  page,
}) => {
  const head = page.locator('head');
  await page.goto('/eleva?lang=en');
  await expect(head.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await expect(head.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /INDAB's investment arm/,
  );
  await expect(head.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://indab-academy.web.app/eleva?lang=en',
  );
  await expect(head.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_US');
  await expect(head.locator('link[hreflang="pt-BR"]')).toHaveAttribute(
    'href',
    'https://indab-academy.web.app/eleva?lang=pt',
  );

  await page.goto('/no-existe');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  await expect(head.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(head.locator('link[hreflang]')).toHaveCount(0);
});

test('robots.txt points crawlers to the sitemap of public pages', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://indab-academy.web.app/sitemap.xml');
  expect(robots).toContain('Disallow: /admin');
  // Keep in sync with the prerendered routes in src/app/app.routes.server.ts.
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of ['/', '/eleva', '/login', '/register']) {
    expect(sitemap).toContain(`<loc>https://indab-academy.web.app${path}</loc>`);
  }
});
