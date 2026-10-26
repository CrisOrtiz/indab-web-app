import { expect, test } from '@playwright/test';
import { createUser, getDocument, listDocuments, resetEmulators } from './emulators';
import { nav, signIn, signOut } from './helpers';

let trainerUid: string;
let joseUid: string;

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  await createUser('Ana Admin', 'admin@indab.test', { role: 'admin' });
  trainerUid = await createUser('Tomás Trainer', 'trainer@indab.test', { role: 'trainer' });
  joseUid = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  await createUser('Luis Díaz', 'luis@indab.test', { academy: true });
  page.on('dialog', (dialog) => dialog.accept());
});

test('an admin groups students in a mentorship and a trainer assigns it a form', async ({
  page,
}) => {
  // The admin creates the mentorship, led by the trainer...
  await signIn(page, 'admin@indab.test', '/login?returnUrl=%2Fadmin');
  await page.getByRole('link', { name: /Mentorías/ }).click();
  await expect(page).toHaveURL('/admin/mentorships');
  await expect(page.getByText('Todavía no hay mentorías.')).toBeVisible();
  await page.getByRole('button', { name: 'Nueva mentoría' }).click();
  await page.getByLabel('Nombre').fill('Grupo oro');
  await page.getByRole('checkbox', { name: /Tomás Trainer/ }).check();
  await page.getByRole('button', { name: 'Guardar mentoría' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó la mentoría Grupo oro.');
  await expect(page.getByRole('heading', { name: /Grupo oro/ })).toContainText('Activa');
  const [mentorship] = await listDocuments('mentorships');
  expect(mentorship).toMatchObject({ name: 'Grupo oro', mentorIds: [trainerUid], active: true });

  // ...and adds José to it from the users page.
  await page.getByRole('link', { name: '← Administración' }).click();
  await page.getByRole('link', { name: /Usuarios/ }).click();
  await page
    .getByRole('combobox', { name: 'Agregar a José Pérez a una mentoría' })
    .selectOption({ label: 'Grupo oro' });
  await expect(page.getByRole('status')).toContainText('José Pérez ahora está en Grupo oro.');
  expect(await getDocument(`users/${joseUid}`)).toMatchObject({
    mentorshipIds: [mentorship['id']],
  });
  await page.getByRole('combobox', { name: 'Filtrar por mentoría' }).selectOption('Grupo oro');
  await expect(page.getByText('1 de 4 usuarios')).toBeVisible();

  // The trainer sees the mentorship and its students, without changing it...
  await signOut(page);
  await signIn(page, 'trainer@indab.test', '/login?returnUrl=%2Fadmin');
  await page.getByRole('link', { name: /Mentorías/ }).click();
  await expect(page.getByRole('button', { name: 'Nueva mentoría' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Acciones: Grupo oro' }).click();
  await page.getByRole('menuitem', { name: 'Ver estudiantes' }).click();
  await expect(page.getByText('José Pérez')).toBeVisible();

  // ...and gives the whole mentorship a form.
  await page.goto('/admin/forms');
  await page.getByRole('button', { name: 'Nuevo formulario' }).click();
  await page.getByLabel('Título').fill('Velas japonesas');
  await page.getByLabel('Las mentorías y los alumnos que elija').check();
  await page.getByRole('checkbox', { name: /Grupo oro/ }).check();
  await expect(page.getByText('En total: 1 estudiante')).toBeVisible();
  await page.getByLabel('Texto de la pregunta').first().fill('¿Qué es un martillo?');
  await page.getByLabel('Pregunta 1 · Opción 1').fill('Vela alcista');
  await page.getByLabel('Pregunta 1 · Opción 2').fill('Vela bajista');
  await page.getByLabel('La opción 1 es correcta').check();
  await page.getByLabel('Puntos', { exact: true }).first().fill('100');
  await page.getByLabel('Publicar para los alumnos').check();
  await page.getByRole('button', { name: 'Guardar formulario' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó el formulario');
  await expect(page.getByText('Mentorías: Grupo oro')).toBeVisible();
  const [form] = await listDocuments('examForms');
  expect(form).toMatchObject({ studentIds: [], mentorshipIds: [mentorship['id']] });

  // Luis is not in the mentorship; José gets the form through it.
  await signOut(page);
  await signIn(page, 'luis@indab.test');
  await page.getByRole('link', { name: /Exámenes/ }).click();
  await expect(page.getByText('No tienes exámenes asignados por ahora.')).toBeVisible();
  await signOut(page);
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: /Exámenes/ }).click();
  await expect(page.getByRole('region', { name: 'Pendientes' })).toContainText('Velas japonesas');
  await expect(nav(page).getByRole('link', { name: 'Administración' })).toHaveCount(0);
});
