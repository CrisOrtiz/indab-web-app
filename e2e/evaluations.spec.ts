import { Page, expect, test } from '@playwright/test';
import { createUser, listDocuments, resetEmulators, setDocument, uidOf } from './emulators';
import { endSession, nav, signIn, signOut } from './helpers';
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
  await page.getByLabel('Nota de aprobación').fill('75');
  await page.getByRole('checkbox', { name: /José Pérez/ }).check();
  await page.getByRole('button', { name: 'Guardar evaluación' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó la evaluación');
  await expect(page.getByRole('heading', { name: /Evaluación semanal/ })).toContainText('Abierta');
  const [evaluation] = await listDocuments('evaluations');
  expect(evaluation).toMatchObject({
    durationMinutes: 20,
    pace: 1,
    passingScore: 75,
    studentIds: [joseUid],
  });

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
  await page.getByRole('button', { name: 'Comenzar evaluación' }).click();
  // The instructions come first, and the attempt starts once they are read.
  const briefing = page.getByRole('dialog', { name: 'Antes de empezar: Evaluación semanal' });
  await expect(briefing).toContainText('Tienes un solo intento de 20 minutos');
  await expect(briefing).toContainText('Apruebas con 75.');
  await expect(briefing.getByRole('button', { name: 'Empezar ahora' })).toBeDisabled();
  await briefing.getByRole('checkbox', { name: 'Leí las instrucciones y estoy listo' }).check();
  await briefing.getByRole('button', { name: 'Empezar ahora' }).click();
  await expect(page.getByText('Evaluación: Evaluación semanal')).toBeVisible();
  await expect(page.getByLabel('Tiempo restante')).toContainText(/Quedan (19|20):\d\d/);
  await page.getByRole('spinbutton', { name: /Lotes \(tamaño/ }).fill('0.01');
  await page.getByRole('button', { name: 'Comprar 0.01 XAUUSDT MERCADO' }).click();
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  // The journal asks why it was entered; it counts for the grade.
  const journal = page.getByRole('region', { name: 'Bitácora' });
  await expect(journal).toContainText('Falta el motivo de entrada.');
  await journal.getByLabel(/Operación 1/).fill('Rechazo en soporte de H1');
  await journal.getByRole('button', { name: 'Guardar' }).click();
  await expect(journal).not.toContainText('Falta el motivo de entrada.');
  // A reload mid-attempt picks it up again, position, journal and clock included.
  await page.reload();
  await expect(page.getByText('Retomaste tu sesión donde la dejaste')).toBeVisible();
  await expect(page.locator('.evaluation-bar')).toContainText(/Quedan 1\d:\d\d/);
  await expect(page.getByRole('button', { name: 'Posiciones (1)' })).toBeVisible();
  await expect(journal.getByLabel(/Operación 1/)).toHaveValue('Rechazo en soporte de H1');
  // It runs by the clock: nothing to step, pause or speed up.
  await expect(page.getByText('En vivo', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente vela' })).toHaveCount(0);
  await endSession(page);
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
  await page.getByRole('button', { name: 'Comenzar evaluación' }).click();
  await page.getByRole('checkbox', { name: 'Leí las instrucciones y estoy listo' }).check();
  await page.getByRole('button', { name: 'Empezar ahora' }).click();
  await expect(page.getByText('En vivo', { exact: true })).toBeVisible();
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

test('a mentor rates an attempt and the student sees the INDAB score and the rubric', async ({
  page,
}) => {
  const hour = 60 * 60 * 1000;
  await setDocument('evaluations/e1', {
    title: 'Final de oro',
    description: '',
    symbol: 'XAUUSDT',
    replayStart: 1_770_000_000_000,
    hideDates: true,
    startingBalance: 200,
    durationMinutes: 30,
    pace: 60,
    opensAt: new Date(Date.now() - 3 * hour),
    closesAt: new Date(Date.now() - hour),
    studentIds: [joseUid],
    mentorshipIds: [],
    resultsPublished: false,
    createdBy: 'seed',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await setDocument(`practiceSessions/e1_${joseUid}`, {
    uid: joseUid,
    userName: 'José Pérez',
    symbol: 'XAUUSDT',
    interval: '15m',
    replayStart: 1_770_000_000_000,
    startingBalance: 200,
    balance: 218,
    pnl: 18,
    tradeCount: 2,
    status: 'finished',
    startedAt: new Date(Date.now() - 2 * hour),
    endedAt: new Date(Date.now() - 2 * hour + 30 * 60_000),
    evaluationId: 'e1',
    durationMinutes: 30,
  });
  // 0.01 lot risking 10 USD to its stop: 5 % of the account.
  await setDocument(`practiceSessions/e1_${joseUid}/trades/t1`, {
    uid: joseUid,
    side: 'long',
    orderType: 'market',
    orderPrice: null,
    placedTime: 1_770_000_000,
    quantity: 1,
    entryPrice: 4000,
    entryTime: 1_770_000_000,
    stopLoss: 3990,
    takeProfit: 4020,
    initialStopLoss: 3990,
    journal: 'Rechazo del soporte diario con vela envolvente',
    status: 'closed',
    exitPrice: 4012,
    exitTime: 1_770_000_600,
    exitReason: 'manual',
    pnl: 12,
  });
  // An hour later, risking 2 USD (1 %) and making 6: 3 R.
  await setDocument(`practiceSessions/e1_${joseUid}/trades/t2`, {
    uid: joseUid,
    side: 'long',
    orderType: 'market',
    orderPrice: null,
    placedTime: 1_770_003_600,
    quantity: 1,
    entryPrice: 4000,
    entryTime: 1_770_003_600,
    stopLoss: 3998,
    takeProfit: 4006,
    initialStopLoss: 3998,
    status: 'closed',
    exitPrice: 4006,
    exitTime: 1_770_004_200,
    exitReason: 'takeProfit',
    pnl: 6,
  });

  await openEvaluations(page);
  await page.getByRole('button', { name: 'Acciones: Final de oro' }).click();
  await page.getByRole('menuitem', { name: 'Ver resultados' }).click();
  const results = page.locator('.results');
  await expect(results).toContainText('Falta rúbrica');

  await page.getByRole('button', { name: 'Acciones del intento de José Pérez' }).click();
  await page.getByRole('menuitem', { name: 'Calificar con rúbrica' }).click();
  for (const criterion of [
    'Plan de entrada',
    'Lectura de contexto',
    'Manejo de la operación',
    'Control emocional',
    'Calidad de la bitácora',
  ]) {
    await page
      .getByRole('radiogroup', { name: criterion })
      .getByRole('radio', { name: '4' })
      .click();
  }
  await page.getByRole('button', { name: 'Guardar rúbrica' }).click();
  await expect(page.getByRole('status')).toContainText('Se guardó la rúbrica de José Pérez.');
  // Result 1.2 R + 3 R = 92; risk 5 % on one trade = -30 and -20 for open risk = 50;
  // discipline 100; rubric 4 = 75; one of two trades journaled = 50: 74.3, passed.
  await expect(results.locator('td.score')).toContainText('74.3');
  await expect(results.locator('td.score')).toContainText('Aprobado');
  await expect(results).toContainText('4.0 / 5');

  await page.getByRole('button', { name: 'Métricas de riesgo' }).click();
  await expect(results).toContainText('máx. 5.0% de la cuenta');
  await expect(results).toContainText('1:2');

  await page.getByRole('button', { name: 'Acciones: Final de oro' }).click();
  await page.getByRole('menuitem', { name: 'Publicar resultados' }).click();
  await expect(page.getByRole('status')).toBeVisible();

  await signOut(page);
  await signIn(page, 'jose@indab.test');
  await page.getByRole('link', { name: 'Ranking de evaluaciones' }).click();
  const ranking = page.locator('table.ranking');
  await expect(ranking.locator('thead')).toContainText('Nota INDAB');
  await expect(ranking.locator('td.score')).toContainText('74.3');
  await expect(ranking.locator('td.score')).toContainText('Aprobado');
  const rubric = page.locator('section.rubric');
  await expect(rubric).toContainText('Rúbrica de tu mentor');
  await expect(rubric).toContainText('4.0 / 5');
  await expect(rubric).toContainText('Calificó Tomás Trainer');
});
