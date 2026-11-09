import { Page, expect, test } from '@playwright/test';
import { createUser, getDocument, resetEmulators } from './emulators';
import { nav, signIn, signOut } from './helpers';

const cards = (page: Page) => page.locator('a.card h2');

test.beforeEach(async () => {
  await resetEmulators();
});

test('an admin hides a section and opens another to staff only', async ({ page }) => {
  await createUser('Ana Admin', 'admin@indab.test', { role: 'admin' });
  await createUser('José Pérez', 'jose@indab.test', { academy: true });

  // The admin turns the ranking off and leaves the practice to staff.
  await signIn(page, 'admin@indab.test', '/login?returnUrl=%2Fadmin');
  await page.getByRole('link', { name: /Funciones/ }).click();
  await expect(page).toHaveURL('/admin/features');
  const ranking = page.getByRole('group', { name: 'Quién ve Ranking' });
  await expect(ranking.getByRole('button', { name: 'Visible para todos' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await ranking.getByRole('button', { name: 'Oculto' }).click();
  await expect(page.getByText('Ranking: oculto.')).toBeVisible();
  await page
    .getByRole('group', { name: 'Quién ve Práctica de trading' })
    .getByRole('button', { name: 'Solo staff' })
    .click();
  await expect(page.getByText('Práctica de trading: solo staff.')).toBeVisible();
  expect(await getDocument('config/features')).toMatchObject({
    flags: { ranking: 'off', practice: 'staff' },
  });

  // Staff still see the practice, nobody sees the ranking.
  await nav(page).getByRole('link', { name: 'Academia' }).click();
  await expect(page).toHaveURL('/academy');
  await expect(cards(page)).toHaveText([
    'Material de estudio',
    'Práctica de trading',
    'Exámenes',
    'Calendario económico',
  ]);
  await signOut(page);

  // The student sees neither, and the hidden pages lead back to the academy.
  await signIn(page, 'jose@indab.test');
  await expect(page).toHaveURL('/academy');
  await expect(cards(page)).toHaveText(['Material de estudio', 'Exámenes', 'Calendario económico']);
  await page.goto('/academy/ranking');
  await expect(page).toHaveURL('/academy');
  await page.goto('/academy/practice');
  await expect(page).toHaveURL('/academy');
});
