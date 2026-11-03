import { Page, expect, test } from '@playwright/test';
import { createUser, listDocuments, resetEmulators, setDocument, uidOf } from './emulators';
import { nav, signIn, signOut } from './helpers';
import { mockMarket } from './market';

let joseUid: string;

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  await createUser('Tomás Trainer', 'trainer@indab.test', { role: 'trainer' });
  joseUid = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  await createUser('Luis Díaz', 'luis@indab.test', { academy: true });
  await mockMarket(page);
});

const openEvaluations = async (page: Page) => {
  await signIn(page, 'trainer@indab.test');
  await nav(page).getByRole('link', { name: 'Administración' }).click();
  await page.getByRole('link', { name: 'Evaluaciones de práctica' }).click();
  await expect(page).toHaveURL('/admin/evaluations');
};

test('a trainer runs an evaluation and the student takes it once, on the clock', async ({
  page,
}) => {
  // Trainers see the evaluations and the practice review, never the user management.
  await openEvaluations(page);
  await page.goBack();
  await expect(page.getByText('Como entrenador puedes crear evaluaciones')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('link', { name: 'Evaluaciones de práctica' }).click();

  await page.getByRole('button', { name: 'Nueva evaluación' }).click();
  await page.getByLabel('Nombre').fill('Evaluación semanal');
  await page.getByLabel('Tiempo límite (minutos)').fill('20');
  // Real time: the price stays put while the test trades.
  await page
    .getByLabel('Ritmo del examen')
    .selectOption({ label: 'Tiempo real (1 min por minuto)' });
  await expect(page.getByText('cubre 20 min de mercado')).toBeVisible();
  await page.getByRole('checkbox', { name: /José Pérez/ }).check();
  await page.getByRole('button', { name: 'Guardar evaluación' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó la evaluación');
  await expect(page.getByRole('heading', { name: /Evaluación semanal/ })).toContainText('Abierta');
  const [evaluation] = await listDocuments('evaluations');
  expect(evaluation).toMatchObject({ durationMinutes: 20, pace: 1, studentIds: [joseUid] });

  // Luis is not assigned: he sees no evaluation.
  await signOut(page);
  await signIn(page, 'luis@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await expect(page.getByRole('heading', { name: 'Comenzar práctica' })).toHaveCount(0);
  await expect(page.getByText('Tus evaluaciones')).toHaveCount(0);

  // José takes it: one attempt, with the time counting down.
  await signOut(page);
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await expect(page.getByText('Tus evaluaciones')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Comenzar evaluación' }).click();
  await expect(page.getByText('Evaluación: Evaluación semanal')).toBeVisible();
  await expect(page.getByLabel('Tiempo restante')).toContainText(/Quedan (19|20):\d\d/);
  await page.getByRole('spinbutton', { name: /Lotes \(tamaño/ }).fill('0.01');
  await page.getByRole('button', { name: 'Comprar 0.01 XAUUSDT MERCADO' }).click();
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  // A reload mid-attempt picks it up again, position and clock included.
  await page.reload();
  await expect(page.getByText('Retomaste tu sesión donde la dejaste')).toBeVisible();
  await expect(page.locator('.evaluation-bar')).toContainText(/Quedan 1\d:\d\d/);
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  // It runs by the clock: nothing to step, pause or speed up.
  await expect(page.getByText('En vivo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente vela' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Sesión terminada' })).toBeVisible();
  // The date stays hidden while others can still take it.
  await expect(page.getByText(/fecha oculta hasta que cierre la evaluación/)).toBeVisible();
  await page.getByRole('button', { name: 'Nueva práctica' }).click();
  await expect(page.locator('.evaluation')).toContainText('Presentada');
  await expect(page.getByRole('button', { name: 'Comenzar evaluación' })).toHaveCount(0);

  const sessions = await listDocuments('practiceSessions');
  expect(sessions).toEqual([
    expect.objectContaining({
      id: `${evaluation['id']}_${joseUid}`,
      evaluationId: evaluation['id'],
      durationMinutes: 20,
      status: 'finished',
      pnl: 0,
    }),
  ]);

  // Results stay with the staff until the trainer publishes them.
  await page.goto('/academy/ranking');
  await expect(
    page.getByText('Todavía no hay resultados de evaluaciones publicados.'),
  ).toBeVisible();

  await signOut(page);
  await openEvaluations(page);
  await page.getByRole('button', { name: 'Acciones: Evaluación semanal' }).click();
  await page.getByRole('menuitem', { name: 'Ver resultados' }).click();
  const row = page.locator('.results tbody tr').first();
  await expect(row).toContainText('José Pérez');
  await expect(row).toContainText('0.00');
  await page.getByRole('button', { name: 'Acciones: Evaluación semanal' }).click();
  await page.getByRole('menuitem', { name: 'Publicar resultados' }).click();
  await expect(page.getByRole('status')).toContainText('Los estudiantes ya ven el ranking');

  await signOut(page);
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Ranking de evaluaciones' }).click();
  await expect(page).toHaveURL('/academy/ranking');
  await expect(page.getByRole('row', { name: /José Pérez Tú/ })).toContainText('0.00');
});

test('an evaluation at one market minute a second moves on its own', async ({ page }) => {
  await openEvaluations(page);
  await page.getByRole('button', { name: 'Nueva evaluación' }).click();
  await page.getByLabel('Nombre').fill('Evaluación en vivo');
  await expect(page.getByLabel('Ritmo del examen')).toHaveValue('60');
  await page.getByRole('checkbox', { name: /José Pérez/ }).check();
  await page.getByRole('button', { name: 'Guardar evaluación' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó la evaluación');

  await signOut(page);
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Comenzar evaluación' }).click();
  await expect(page.getByText('En vivo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reproducir' })).toHaveCount(0);
  // The first replayed minute comes after a second, with no one pressing play.
  await expect(page.locator('.market .price')).toHaveText('101.000', { timeout: 10_000 });
});

test('free practice stays out of the ranking and private', async ({ page }) => {
  await setDocument('practiceSessions/a', {
    uid: joseUid,
    userName: 'José Pérez',
    symbol: 'PAXGUSDT',
    interval: '15m',
    replayStart: 1_700_000_000_000,
    startingBalance: 200,
    balance: 212.5,
    pnl: 12.5,
    tradeCount: 4,
    status: 'finished',
    startedAt: new Date(),
    endedAt: new Date(),
    evaluationId: null,
  });
  await signIn(page, 'luis@indab.test');
  await page.getByRole('link', { name: 'Ranking de evaluaciones' }).click();
  await expect(
    page.getByText('Todavía no hay resultados de evaluaciones publicados.'),
  ).toBeVisible();
  await expect(page.getByText('José Pérez')).toHaveCount(0);
});

test('a trainer duplicates an evaluation to give the same replay to other students', async ({
  page,
}) => {
  await openEvaluations(page);
  await page.getByRole('button', { name: 'Nueva evaluación' }).click();
  await page.getByLabel('Nombre').fill('Evaluación semanal');
  await page.getByLabel('Tiempo límite (minutos)').fill('20');
  await page.getByRole('checkbox', { name: /José Pérez/ }).check();
  await page.getByRole('button', { name: 'Guardar evaluación' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó la evaluación');

  // The card's actions are in its three-dot menu.
  await page.getByRole('button', { name: 'Acciones: Evaluación semanal' }).click();
  await expect(page.getByRole('menuitem')).toHaveText([
    'Ver resultados',
    'Publicar resultados',
    'Editar',
    'Duplicar',
    'Eliminar',
  ]);
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  await expect(page.getByRole('heading', { name: 'Duplicar evaluación' })).toBeVisible();
  await expect(page.getByLabel('Nombre')).toHaveValue('Evaluación semanal (copia)');
  await expect(page.getByLabel('Tiempo límite (minutos)')).toHaveValue('20');
  await page.getByRole('checkbox', { name: /Luis Díaz/ }).check();
  await page.getByRole('button', { name: 'Guardar evaluación' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Se guardó la evaluación Evaluación semanal (copia)',
  );

  const evaluations = await listDocuments('evaluations');
  const original = evaluations.find((e) => e['title'] === 'Evaluación semanal')!;
  const duplicate = evaluations.find((e) => e['title'] === 'Evaluación semanal (copia)')!;
  expect(duplicate).toMatchObject({
    symbol: original['symbol'],
    replayStart: original['replayStart'],
    durationMinutes: 20,
    pace: 60,
    studentIds: [await uidOf('luis@indab.test')],
  });

  await signOut(page);
  await signIn(page, 'luis@indab.test');
  await page.getByRole('link', { name: 'Práctica de trading' }).click();
  await expect(page.locator('.evaluation')).toContainText('Evaluación semanal (copia)');
});
