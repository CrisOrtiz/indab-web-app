import { Page, expect, test } from '@playwright/test';
import { createUser, getDocument, listDocuments, resetEmulators, setDocument } from './emulators';
import { signIn, signOut } from './helpers';
import { mockMarket } from './market';

let trainerUid: string;
let joseUid: string;
const hour = 60 * 60 * 1000;

/** Puts a user in mentorships (the profile is written whole, as `createUser` does). */
async function joinMentorships(uid: string, name: string, email: string, ids: string[]) {
  await setDocument(`users/${uid}`, {
    uid,
    email,
    displayName: name,
    role: 'student',
    createdAt: new Date(),
    birthDate: '1990-05-15',
    mentorshipIds: ids,
  });
}

test.beforeEach(async ({ page }) => {
  await resetEmulators();
  trainerUid = await createUser('Tomás Trainer', 'trainer@indab.test', { role: 'trainer' });
  await createUser('Carla Coach', 'coach@indab.test', { role: 'trainer' });
  joseUid = await createUser('José Pérez', 'jose@indab.test', { academy: true });
  // Tomás mentors "Grupo oro", where José is; Carla mentors nobody.
  await setDocument('mentorships/m1', {
    name: 'Grupo oro',
    description: '',
    mentorIds: [trainerUid],
    startDate: '2026-10-01',
    endDate: null,
    active: true,
    createdBy: trainerUid,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await joinMentorships(joseUid, 'José Pérez', 'jose@indab.test', ['m1']);
  await mockMarket(page);
  page.on('dialog', (dialog) => dialog.accept());
});

const bell = (page: Page) => page.getByRole('button', { name: /^Notificaciones/ });

test('a mentor leaves a note on a practice and the student is notified', async ({ page }) => {
  await setDocument('practiceSessions/s1', {
    uid: joseUid,
    userName: 'José Pérez',
    symbol: 'XAUUSDT',
    interval: '15m',
    replayStart: Date.UTC(2026, 2, 3, 8),
    startingBalance: 200,
    balance: 212.5,
    pnl: 12.5,
    tradeCount: 0,
    status: 'finished',
    startedAt: new Date(Date.now() - hour),
    endedAt: new Date(),
    evaluationId: null,
  });

  // A trainer outside José's mentorships reads the review but cannot write.
  await signIn(page, 'coach@indab.test', '/login?returnUrl=%2Facademy%2Fpractice%2Fsessions%2Fs1');
  const notes = page.getByRole('region', { name: 'Notas del mentor' });
  await expect(notes).toContainText('Solo los mentores de una mentoría de este estudiante');
  await expect(notes.getByRole('textbox')).toHaveCount(0);
  await signOut(page);

  // His mentor leaves one.
  await signIn(
    page,
    'trainer@indab.test',
    '/login?returnUrl=%2Facademy%2Fpractice%2Fsessions%2Fs1',
  );
  await expect(page.getByRole('heading', { level: 1 })).toContainText('José Pérez');
  await notes.getByLabel('Nueva nota').fill('Buen stop loss, pero entraste tarde.');
  await notes.getByRole('button', { name: 'Dejar nota' }).click();
  await expect(notes).toContainText('Buen stop loss, pero entraste tarde.');
  const [note] = await listDocuments('mentorNotes');
  expect(note).toMatchObject({ studentId: joseUid, targetId: 's1', mentorshipId: 'm1' });
  await signOut(page);

  // José sees it on the bell, opens it and reads the note.
  await signIn(page, 'jose@indab.test');
  await expect(bell(page)).toHaveAccessibleName('Notificaciones, 1 sin leer');
  await bell(page).click();
  await page.getByRole('button', { name: /Tomás Trainer dejó una nota en tu práctica/ }).click();
  await expect(page).toHaveURL('/academy/practice/sessions/s1');
  await expect(page.getByRole('region', { name: 'Notas de tu mentor' })).toContainText(
    'Buen stop loss, pero entraste tarde.',
  );
  await expect(bell(page)).toHaveAccessibleName('Notificaciones');
  expect(await getDocument(`users/${joseUid}/notifications/note_${note['id']}`)).toMatchObject({
    read: true,
  });
});

test('a mentor follows their mentorship and hears when a student hands in a form', async ({
  page,
}) => {
  await setDocument('examForms/x1', {
    title: 'Velas japonesas',
    description: '',
    totalPoints: 10,
    passingPoints: 6,
    durationMinutes: 0,
    maxAttempts: 1,
    audience: 'selected',
    studentIds: [],
    mentorshipIds: ['m1'],
    opensAt: new Date(Date.now() - hour),
    closesAt: new Date(Date.now() + hour),
    questions: [
      {
        id: 'q1',
        type: 'trueFalse',
        text: '¿Un martillo es una vela de giro?',
        imageUrl: '',
        options: [],
        points: 10,
        partial: false,
      },
    ],
    published: true,
    resultsPublished: false,
    showAnswers: false,
    createdBy: trainerUid,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await setDocument('examKeys/x1', { answers: { q1: [0] }, updatedAt: new Date() });

  // Tomás follows nothing yet; he picks his mentorship and hand-ins only.
  await signIn(page, 'trainer@indab.test', '/login?returnUrl=%2Fprofile');
  const settings = page.locator('app-notification-settings');
  await expect(settings).toContainText('Aún no sigues nada');
  await settings.getByRole('checkbox', { name: /Grupo oro/ }).check();
  await expect(settings).toContainText('Eres mentor');
  await settings
    .getByRole('checkbox', { name: 'Un estudiante terminó una práctica libre' })
    .uncheck();
  await settings.getByRole('button', { name: 'Guardar preferencias' }).click();
  await expect(settings.getByRole('status')).toContainText('Preferencias guardadas.');
  expect(await getDocument(`follows/mentorship/subjects/m1/followers/${trainerUid}`)).toMatchObject(
    { types: ['evaluationFinished', 'examSubmitted'] },
  );
  await signOut(page);

  // José hands the form in.
  await signIn(page, 'jose@indab.test', '/login?returnUrl=%2Facademy%2Fexams%2Fx1');
  await page.getByRole('button', { name: 'Comenzar intento 1' }).click();
  await page.getByRole('radio', { name: 'Verdadero' }).check();
  await page.getByRole('button', { name: 'Entregar' }).click();
  await expect(page.getByText('¡Entregado!')).toBeVisible();
  await signOut(page);

  // Tomás is told and goes straight to grading it; Carla, who follows nobody, is not.
  await signIn(page, 'trainer@indab.test');
  await expect(bell(page)).toHaveAccessibleName('Notificaciones, 1 sin leer');
  await bell(page).click();
  await page
    .getByRole('button', { name: /José Pérez entregó el formulario «Velas japonesas»/ })
    .click();
  await expect(page).toHaveURL(`/admin/forms/x1?submission=x1_${joseUid}_1`);
  await expect(page.getByRole('heading', { level: 2 })).toContainText('José Pérez');
  expect(await listDocuments(`users/${joseUid}/notifications`)).toEqual([]);
  await signOut(page);
  await signIn(page, 'coach@indab.test');
  await expect(bell(page)).toHaveAccessibleName('Notificaciones');
});
