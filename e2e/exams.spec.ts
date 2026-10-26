import { Page, expect, test } from '@playwright/test';
import { createUser, getDocument, listDocuments, resetEmulators } from './emulators';
import { nav, signIn, signOut } from './helpers';

let joseUid: string;

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  await createUser('Tomás Trainer', 'trainer@indab.test', { role: 'trainer' });
  joseUid = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  await createUser('Luis Díaz', 'luis@indab.test', { academy: true });
  // Starting an attempt and handing it in ask for confirmation.
  page.on('dialog', (dialog) => dialog.accept());
});

const openForms = async (page: Page) => {
  await signIn(page, 'trainer@indab.test');
  await nav(page).getByRole('link', { name: 'Administración' }).click();
  await page.getByRole('link', { name: /Formularios de evaluación/ }).click();
  await expect(page).toHaveURL('/admin/forms');
};

const openExams = async (page: Page, email: string) => {
  await signIn(page, email);
  await page.getByRole('link', { name: /Exámenes/ }).click();
  await expect(page).toHaveURL('/academy/exams');
};

test('a trainer builds a scored form, the student answers it and sees the grade', async ({
  page,
}) => {
  await openForms(page);

  // The form: 100 points to pass with 70, a closed question and an open one.
  await page.getByRole('button', { name: 'Nuevo formulario' }).click();
  await page.getByLabel('Título').fill('Fundamentos de trading');
  await page.getByLabel('Las mentorías y los alumnos que elija').check();
  await page.getByRole('checkbox', { name: /José Pérez/ }).check();
  await page.getByLabel('Texto de la pregunta').first().fill('¿Qué indica un RSI sobre 70?');
  await page.getByLabel('Pregunta 1 · Opción 1').fill('Sobrecompra');
  await page.getByLabel('Pregunta 1 · Opción 2').fill('Sobreventa');
  await page.getByLabel('La opción 1 es correcta').check();
  await page.getByLabel('Puntos', { exact: true }).first().fill('60');
  await expect(page.getByText('Suma: 60 de 100 puntos')).toBeVisible();
  // A new question takes the points left.
  await page.getByRole('button', { name: '+ Agregar pregunta' }).click();
  await page.getByLabel('Tipo · Pregunta 2').selectOption('open');
  await page.getByLabel('Texto de la pregunta').nth(1).fill('¿Dónde pondrías el stop loss?');
  await expect(page.getByText('Suma: 100 de 100 puntos')).toBeVisible();
  await page.getByLabel('Publicar para los alumnos').check();
  await page.getByRole('button', { name: 'Guardar formulario' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó el formulario');
  await expect(page.getByRole('heading', { name: /Fundamentos de trading/ })).toContainText(
    'Abierto',
  );

  // The right answers are kept apart from the questions students read.
  const [form] = await listDocuments('examForms');
  expect(form).toMatchObject({ totalPoints: 100, passingPoints: 70, studentIds: [joseUid] });
  expect(JSON.stringify(form)).not.toContain('correct');
  expect(await getDocument(`examKeys/${form['id']}`)).toBeTruthy();

  // Luis is not assigned.
  await signOut(page);
  await openExams(page, 'luis@indab.test');
  await expect(page.getByText('No tienes exámenes asignados por ahora.')).toBeVisible();

  // José answers it, against the clock, and hands it in.
  await signOut(page);
  await openExams(page, 'jose@indab.test');
  const pending = page.getByRole('region', { name: 'Pendientes' });
  await expect(pending).toContainText('Fundamentos de trading');
  await pending.getByRole('link', { name: 'Comenzar' }).click();
  await page.getByRole('button', { name: 'Comenzar intento 1' }).click();
  await expect(page.getByRole('timer', { name: 'Tiempo restante' })).toContainText(
    /Quedan (29|30):\d\d/,
  );
  await page.getByRole('radio', { name: 'Sobrecompra' }).check();
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await page.getByLabel('Tu respuesta').fill('Bajo el último mínimo');
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.getByText('¡Entregado!')).toBeVisible();
  await expect(page.locator('.attempts')).toContainText('En revisión');
  await expect(page.getByRole('button', { name: /Comenzar intento/ })).toHaveCount(0);
  const [attempt] = await listDocuments('examSubmissions');
  expect(attempt).toMatchObject({ id: `${form['id']}_${joseUid}_1`, status: 'submitted' });

  // The trainer grades it: the closed question comes scored, the open one is theirs.
  await signOut(page);
  await openForms(page);
  await page.getByRole('button', { name: 'Acciones: Fundamentos de trading' }).click();
  await page.getByRole('menuitem', { name: 'Calificar entregas' }).click();
  await expect(page.getByRole('row', { name: /José Pérez/ })).toContainText('Por calificar');
  await page.getByRole('button', { name: 'Calificar a José Pérez, intento 1' }).click();
  await expect(page.getByText('Sugerido: 60 de 60')).toBeVisible();
  await page.getByLabel('Puntos de la pregunta 2 (de 40)').fill('30');
  await page.getByLabel('Comentario de la pregunta 2').fill('Bien, cuida el tamaño del lote');
  await expect(page.getByText('Total: 90 de 100 · Aprobado')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar calificación' }).click();
  await expect(page.getByRole('status').first()).toContainText('Se guardó la calificación');
  await expect(page.getByRole('row', { name: /José Pérez/ })).toContainText('90 / 100');

  // Until the results are published, José only sees that it is under review.
  await signOut(page);
  await openExams(page, 'jose@indab.test');
  await expect(page.getByRole('region', { name: 'Terminados' })).toContainText('En revisión');

  await signOut(page);
  await openForms(page);
  await page.getByRole('button', { name: 'Acciones: Fundamentos de trading' }).click();
  await page.getByRole('menuitem', { name: 'Calificar entregas' }).click();
  await page.getByRole('button', { name: 'Publicar resultados' }).click();
  await expect(page.getByRole('status')).toContainText('Los alumnos ya ven sus notas');
  await page.getByLabel('Mostrar las respuestas correctas a los alumnos').check();
  await expect(page.getByRole('status')).toContainText('verán las respuestas correctas');

  await signOut(page);
  await openExams(page, 'jose@indab.test');
  const done = page.getByRole('region', { name: 'Terminados' });
  await expect(done).toContainText('90 / 100 · Aprobado');
  await done.getByRole('link', { name: 'Ver' }).click();
  await expect(page.locator('.best')).toContainText('90 / 100');
  await page.getByRole('button', { name: 'Revisión del intento 1' }).click();
  const review = page.getByRole('region', { name: 'Revisión del intento 1' });
  await expect(review).toContainText('Bien, cuida el tamaño del lote');
  await expect(
    review.getByRole('listitem').filter({ hasText: 'Sobrecompra' }).first(),
  ).toContainText('Respuesta correcta');
});

test('forms for everyone reach every student, and drafts reach nobody', async ({ page }) => {
  await openForms(page);
  await page.getByRole('button', { name: 'Nuevo formulario' }).click();
  await page.getByLabel('Título').fill('Borrador');
  await page.getByLabel('Texto de la pregunta').fill('¿Verdadero?');
  await page.getByLabel('Tipo · Pregunta 1').selectOption('trueFalse');
  await page.getByLabel('Puntos', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Guardar formulario' }).click();
  await expect(page.getByRole('heading', { name: /Borrador/ })).toContainText('Borrador');

  // Publishing checks that the points add up.
  await page.getByRole('button', { name: 'Nuevo formulario' }).click();
  await page.getByLabel('Título').fill('Gestión de riesgo');
  await page.getByLabel('Texto de la pregunta').fill('El stop loss limita la pérdida');
  await page.getByLabel('Tipo · Pregunta 1').selectOption('trueFalse');
  await page.getByLabel('Publicar para los alumnos').check();
  await page.getByRole('button', { name: 'Guardar formulario' }).click();
  await expect(page.locator('p.message')).toContainText(
    'Las preguntas suman 10 puntos y el puntaje total es 100.',
  );
  await page.getByLabel('Puntos', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Guardar formulario' }).click();
  await expect(page.locator('p.message')).toContainText(
    'Se guardó el formulario Gestión de riesgo',
  );

  await signOut(page);
  await openExams(page, 'luis@indab.test');
  await expect(page.getByRole('region', { name: 'Pendientes' })).toContainText('Gestión de riesgo');
  await expect(page.getByText('Borrador')).toHaveCount(0);
});

test('a trainer duplicates a form to give the same test to other students', async ({ page }) => {
  await openForms(page);
  await page.getByRole('button', { name: 'Nuevo formulario' }).click();
  await page.getByLabel('Título').fill('Gestión de riesgo');
  await page.getByLabel('Las mentorías y los alumnos que elija').check();
  await page.getByRole('checkbox', { name: /José Pérez/ }).check();
  await page.getByLabel('Texto de la pregunta').fill('El stop loss limita la pérdida');
  await page.getByLabel('Tipo · Pregunta 1').selectOption('trueFalse');
  await page.getByLabel('Puntos', { exact: true }).fill('100');
  await page.getByLabel('Publicar para los alumnos').check();
  await page.getByRole('button', { name: 'Guardar formulario' }).click();
  await expect(page.locator('p.message')).toContainText('Se guardó el formulario');

  // The copy keeps the questions and answers; the trainer picks Luis and publishes it.
  await page.getByRole('button', { name: 'Acciones: Gestión de riesgo' }).click();
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  await expect(page.getByRole('heading', { name: 'Duplicar formulario' })).toBeVisible();
  await expect(page.getByLabel('Título')).toHaveValue('Gestión de riesgo (copia)');
  await expect(page.getByLabel('Texto de la pregunta')).toHaveValue(
    'El stop loss limita la pérdida',
  );
  await expect(page.getByRole('checkbox', { name: /José Pérez/ })).not.toBeChecked();
  await page.getByRole('checkbox', { name: /Luis Díaz/ }).check();
  await page.getByLabel('Publicar para los alumnos').check();
  await page.getByRole('button', { name: 'Guardar formulario' }).click();
  await expect(page.locator('p.message')).toContainText(
    'Se guardó el formulario Gestión de riesgo (copia)',
  );

  const forms = await listDocuments('examForms');
  const original = forms.find((f) => f['title'] === 'Gestión de riesgo')!;
  const copy = forms.find((f) => f['title'] === 'Gestión de riesgo (copia)')!;
  expect(copy['questions']).toEqual(original['questions']);
  expect(copy['studentIds']).not.toEqual(original['studentIds']);
  // The copy has its own answer key.
  expect(await getDocument(`examKeys/${copy['id']}`)).not.toBeNull();

  await signOut(page);
  await openExams(page, 'luis@indab.test');
  const pending = page.getByRole('region', { name: 'Pendientes' });
  await expect(pending).toContainText('Gestión de riesgo (copia)');
  await expect(pending.getByText('Gestión de riesgo', { exact: true })).toHaveCount(0);
});
