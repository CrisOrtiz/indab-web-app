import { Page, expect, test } from '@playwright/test';
import { createUser, getDocument, resetEmulators, setDocument } from './emulators';
import { signIn, signOut } from './helpers';

const testimonials = (page: Page) =>
  page.getByRole('heading', { name: 'Lo que dicen nuestros estudiantes' });

/** The landing reads its reviews once the visitor scrolls near them. */
async function scrollToReviews(page: Page): Promise<void> {
  await page.getByRole('heading', { name: 'Resolvemos tus dudas' }).scrollIntoViewIfNeeded();
}

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  page.on('dialog', (dialog) => dialog.accept());
});

test('a student reviews INDAB from the profile and an admin puts it on the landing', async ({
  page,
}) => {
  await createUser('Ana Admin', 'admin@indab.test', { role: 'admin' });
  const uid = await createUser('José Pérez', 'jose@indab.test', { academy: true });

  // Nothing is picked yet, so the landing has no testimonials.
  await page.goto('/');
  await scrollToReviews(page);
  await expect(page.getByRole('heading', { name: 'Hablemos' })).toBeVisible();
  await expect(testimonials(page)).toHaveCount(0);

  // The student writes a review from their profile.
  await signIn(page, 'jose@indab.test');
  await expect(page).toHaveURL('/academy');
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Mi perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Tu reseña de INDAB' })).toBeVisible();
  await expect(page.getByLabel('Nombre que se mostrará')).toHaveValue('José Pérez');
  await page.getByRole('radio', { name: '5 estrellas' }).check();
  await page
    .getByLabel('Tu reseña')
    .fill('Aprendí a operar con un plan y a respetar mi stop loss.');
  await page.getByLabel('Nombre que se mostrará').fill('José P.');
  await page.getByRole('button', { name: 'Enviar reseña' }).click();
  await expect(page.getByText('Reseña enviada. El equipo de INDAB la revisará.')).toBeVisible();
  await expect(page.getByText('En revisión: todavía no se muestra')).toBeVisible();
  expect(await getDocument(`reviews/${uid}`)).toMatchObject({
    name: 'José P.',
    rating: 5,
    text: 'Aprendí a operar con un plan y a respetar mi stop loss.',
    featured: false,
  });
  await signOut(page);

  // The admin picks it for the landing.
  await signIn(page, 'admin@indab.test', '/login?returnUrl=%2Fadmin');
  await page.getByRole('link', { name: /Reseñas/ }).click();
  await expect(page).toHaveURL('/admin/reviews');
  const card = page.getByRole('listitem').filter({ hasText: 'José P.' });
  await expect(card).toContainText('jose@indab.test');
  await expect(card.getByRole('img', { name: '5 de 5 estrellas' })).toBeVisible();
  await card.getByRole('button', { name: 'Mostrar en inicio' }).click();
  await expect(
    page.getByText('La reseña de José P. ya se muestra en la página de inicio.'),
  ).toBeVisible();
  await expect(card).toContainText('En la página de inicio');
  expect(await getDocument(`reviews/${uid}`)).toMatchObject({ featured: true });
  await signOut(page);

  // Visitors see it on the landing.
  await scrollToReviews(page);
  await expect(testimonials(page)).toBeVisible();
  const review = page.locator('#testimonios li');
  await expect(review).toHaveCount(1);
  await expect(review).toContainText('“Aprendí a operar con un plan y a respetar mi stop loss.”');
  await expect(review).toContainText('José P.');
  await expect(review.getByRole('img', { name: '5 de 5 estrellas' })).toBeVisible();
});

test('editing a review takes it off the landing until an admin picks it again', async ({
  page,
}) => {
  const uid = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  await setDocument(`reviews/${uid}`, {
    name: 'José P.',
    photoURL: null,
    rating: 4,
    text: 'Las prácticas en el gráfico del oro son muy útiles.',
    featured: true,
    featuredAt: new Date(),
    featuredBy: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await page.goto('/');
  await scrollToReviews(page);
  await expect(page.locator('#testimonios li')).toContainText('gráfico del oro');

  await signIn(page, 'jose@indab.test', '/login?returnUrl=%2Fprofile');
  await expect(page.getByText('Tu reseña se muestra en la página de inicio.')).toBeVisible();
  await page.getByLabel('Tu reseña').fill('Las prácticas en el gráfico del oro me ayudaron mucho.');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('En revisión: todavía no se muestra')).toBeVisible();
  expect(await getDocument(`reviews/${uid}`)).toMatchObject({ featured: false, rating: 4 });
});
