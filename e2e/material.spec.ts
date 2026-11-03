import { Page, expect, test } from '@playwright/test';
import { createUser, listDocuments, resetEmulators } from './emulators';
import { nav, signIn, signOut } from './helpers';

let joseUid: string;

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  await createUser('Tomás Trainer', 'trainer@indab.test', { role: 'trainer' });
  joseUid = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  await createUser('Luis Díaz', 'luis@indab.test', { academy: true });
  await createUser('Pía Pendiente', 'pia@indab.test');
  page.on('dialog', (dialog) => dialog.accept());
  // Keep the players and previews offline.
  await page.route(/youtube-nocookie\.com|ytimg\.com|docs\.google\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' }),
  );
});

const openMaterial = async (page: Page, email: string) => {
  await signIn(page, email);
  await page.getByRole('link', { name: /Material de estudio/ }).click();
  await expect(page).toHaveURL('/academy/material');
};

test('a trainer shares a video and a presentation, and students open what is theirs', async ({
  page,
}) => {
  await signIn(page, 'trainer@indab.test');
  await nav(page).getByRole('link', { name: 'Administración' }).click();
  await page.getByRole('link', { name: /Material de estudio/ }).click();
  await expect(page).toHaveURL('/admin/material');
  await expect(page.getByText('Todavía no hay material.')).toBeVisible();

  // A class recorded on YouTube, for everyone.
  await page.getByRole('button', { name: 'Nuevo material' }).click();
  await page.getByLabel('Enlace', { exact: true }).fill('https://youtu.be/dQw4w9WgXcQ');
  await expect(page.getByText('YouTube: se verá dentro de la academia.')).toBeVisible();
  await page.getByLabel('Título', { exact: true }).fill('Clase 1: soportes y resistencias');
  await page.getByLabel('Tema', { exact: true }).fill('Análisis técnico');
  await page.getByLabel('Descripción').fill('La primera clase del curso.');
  await expect(page.locator('.preview iframe')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
  );
  await page.getByRole('button', { name: 'Guardar material' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó «Clase 1');

  // A Google Slides deck for José only.
  await page.getByRole('button', { name: 'Nuevo material' }).click();
  await page
    .getByLabel('Enlace', { exact: true })
    .fill('https://docs.google.com/presentation/d/1SlideDeckId_x/edit');
  await expect(page.locator('form').getByLabel('Tipo', { exact: true })).toHaveValue(
    'presentation',
  );
  await page.getByLabel('Título', { exact: true }).fill('Plan de trading');
  await page.getByLabel('Las mentorías y los alumnos que elija').check();
  await page.getByRole('checkbox', { name: /José Pérez/ }).check();
  await page.getByRole('button', { name: 'Guardar material' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó «Plan de trading».');
  await expect(page.getByText('Para 1 alumno')).toBeVisible();

  const deck = (await listDocuments('materials')).find((m) => m['title'] === 'Plan de trading');
  expect(deck).toMatchObject({ kind: 'presentation', audience: 'selected', studentIds: [joseUid] });

  // José sees both, by topic, and watches the class inside the academy.
  await signOut(page);
  await openMaterial(page, 'jose@indab.test');
  await expect(page.getByRole('heading', { name: 'Análisis técnico' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan de trading' })).toBeVisible();
  await page.getByRole('link', { name: /Clase 1: soportes y resistencias/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Clase 1: soportes y resistencias',
  );
  await expect(page.getByTitle('Material: Clase 1: soportes y resistencias')).toHaveAttribute(
    'src',
    /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
  );
  await expect(page.getByRole('link', { name: /Abrir en YouTube/ })).toHaveAttribute(
    'href',
    'https://youtu.be/dQw4w9WgXcQ',
  );

  // Luis only gets the class, not José's deck.
  await signOut(page);
  await openMaterial(page, 'luis@indab.test');
  await expect(page.getByRole('link', { name: /Clase 1/ })).toBeVisible();
  await expect(page.getByText('Plan de trading')).toHaveCount(0);
});

test('a draft stays with the team and pending students find the material locked', async ({
  page,
}) => {
  await signIn(page, 'trainer@indab.test', '/login?returnUrl=%2Fadmin%2Fmaterial');
  await page.getByRole('button', { name: 'Nuevo material' }).click();
  await page.getByLabel('Enlace', { exact: true }).fill('https://example.com/glosario.pdf');
  await expect(page.getByText('Este enlace se abrirá en una pestaña nueva.')).toBeVisible();
  await page.getByLabel('Título', { exact: true }).fill('Glosario');
  await page.getByLabel('Publicar para los alumnos').uncheck();
  await page.getByRole('button', { name: 'Guardar material' }).click();
  await expect(page.getByRole('heading', { name: /Glosario/ })).toContainText('Borrador');

  await signOut(page);
  await openMaterial(page, 'jose@indab.test');
  await expect(page.getByText('Todavía no hay material para ti.')).toBeVisible();

  // Without academy access the card is locked and the page is closed.
  await signOut(page);
  await signIn(page, 'pia@indab.test');
  await expect(page).toHaveURL('/academy');
  await expect(page.getByRole('link', { name: /Material de estudio/ })).toHaveCount(0);
  await expect(page.locator('.card.locked', { hasText: 'Material de estudio' })).toBeVisible();
});
