import { expect, test } from '@playwright/test';
import { createUser, getDocument, resetEmulators, setDocument } from './emulators';
import { signIn } from './helpers';
import { mockMarket } from './market';

const DAY = 24 * 60 * 60 * 1000;

/** Puts an existing user in mentorship `m1` (a PATCH replaces the whole profile). */
async function join(uid: string): Promise<void> {
  const profile = (await getDocument(`users/${uid}`)) as Record<string, string>;
  await setDocument(`users/${uid}`, {
    uid,
    email: profile['email'],
    displayName: profile['displayName'],
    role: 'student',
    birthDate: profile['birthDate'],
    createdAt: new Date(),
    mentorshipIds: ['m1'],
  });
}

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  const trainer = await createUser('Tomás Trainer', 'trainer@indab.test', { role: 'trainer' });
  const jose = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  const luis = await createUser('Luis Díaz', 'luis@indab.test', { academy: true });
  await createUser('Eva Ruiz', 'eva@indab.test', { academy: true });
  await setDocument('mentorships/m1', {
    name: 'Grupo oro',
    description: '',
    mentorIds: [trainer],
    startDate: '2026-10-01',
    endDate: null,
    active: true,
    createdBy: trainer,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await join(jose);
  await join(luis);

  // José practised today: one winning and one losing trade. Luis has not practised.
  await setDocument('practiceSessions/s1', {
    uid: jose,
    userName: 'José Pérez',
    symbol: 'XAUUSDT',
    interval: '15m',
    replayStart: 1_770_000_000_000,
    startingBalance: 200,
    balance: 206,
    pnl: 6,
    tradeCount: 2,
    status: 'finished',
    startedAt: new Date(),
    evaluationId: null,
  });
  for (const [id, pnl] of [
    ['t1', 10],
    ['t2', -4],
  ] as const) {
    await setDocument(`practiceSessions/s1/trades/${id}`, {
      uid: jose,
      side: 'long',
      orderType: 'market',
      orderPrice: null,
      placedTime: 1_770_000_000,
      quantity: 0.01,
      entryPrice: 4000,
      entryTime: 1_770_000_000,
      stopLoss: null,
      takeProfit: null,
      status: 'closed',
      exitPrice: 4010,
      exitTime: 1_770_003_600,
      exitReason: 'manual',
      pnl,
      closedAt: new Date(),
    });
  }

  // A form for the mentorship: José handed it in and got 8 of 10; Luis has not.
  await setDocument('examForms/f1', {
    title: 'Velas japonesas',
    description: '',
    totalPoints: 10,
    passingPoints: 6,
    durationMinutes: 0,
    maxAttempts: 1,
    audience: 'selected',
    studentIds: [],
    mentorshipIds: ['m1'],
    opensAt: new Date(Date.now() - DAY),
    closesAt: new Date(Date.now() + 5 * DAY),
    questions: [],
    published: true,
    resultsPublished: false,
    showAnswers: false,
    createdBy: trainer,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await setDocument(`examSubmissions/f1_${jose}_1`, {
    examId: 'f1',
    uid: jose,
    userName: 'José Pérez',
    attempt: 1,
    status: 'submitted',
    startedAt: new Date(),
    submittedAt: new Date(),
  });
  await setDocument(`examGrades/f1_${jose}_1`, {
    examId: 'f1',
    uid: jose,
    attempt: 1,
    total: 8,
    passed: true,
    feedback: '',
    gradedBy: trainer,
    gradedAt: new Date(),
  });
  await mockMarket(page);
});

test("a mentor follows their group's practice and pending work", async ({ page }) => {
  await signIn(page, 'trainer@indab.test', '/login?returnUrl=%2Fadmin');
  await page.getByRole('link', { name: /Panel del mentor/ }).click();
  await expect(page).toHaveURL('/admin/mentor');
  await expect(page.getByLabel('Mentoría')).toHaveValue('m1');

  const stat = (label: string) =>
    page
      .locator('.stat')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('strong');
  await expect(stat('Practicaron')).toHaveText('1 / 2');
  await expect(stat('P/L promedio por estudiante (USD)')).toHaveText('6.00');
  // Read with the staff-only collection group query over every session's trades.
  await expect(stat('Operaciones ganadoras')).toHaveText('50%');
  await expect(stat('Promedio en formularios')).toHaveText('80%');
  await expect(stat('Entregas pendientes')).toHaveText('1');

  const rows = page.locator('table.dashboard tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Luis Díaz' })).toContainText('Sin práctica');
  await expect(rows.filter({ hasText: 'Luis Díaz' })).toContainText('Velas japonesas');
  await expect(page.locator('.delivery')).toContainText('1 de 2 entregaron');
  await expect(page.locator('.delivery')).toContainText('Faltan: Luis Díaz');
  await expect(page.getByText('Eva Ruiz')).toHaveCount(0);

  await page.getByLabel('Mostrar').selectOption({ label: 'Sin práctica en el periodo' });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Luis Díaz');

  // The practice review opens filtered to the student.
  await page.getByLabel('Mostrar').selectOption({ label: 'Todos' });
  await page.getByRole('link', { name: 'Ver las prácticas de José Pérez' }).click();
  await expect(page).toHaveURL(/\/admin\/practice\?student=/);
  await expect(page.getByLabel('Estudiante')).toHaveValue(/.+/);
  await expect(page.locator('table.sessions > tbody > tr')).toHaveCount(1);
  await expect(page.locator('table.sessions')).toContainText('José Pérez');
});
