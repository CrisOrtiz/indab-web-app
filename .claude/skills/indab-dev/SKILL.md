---
name: indab-dev
description: Conventions for building the INDAB web app (Angular 22 + plain Firebase SDK). Use before adding or changing features, Firestore collections, security rules, routes or UI in this repo, including the landing page, learning-material repository, academy and Eleva Inversiones modules.
---

# Building the INDAB web app

The app serves two businesses:

- **INDAB Academy**: trading school. Public landing, accounts, academy area for students, and a
  learning-material repository that only enrolled students can open.
- **Eleva Inversiones**: INDAB's investment arm. Pools investor money, trades it and pays monthly
  returns. Public info page plus a private investor area.

## Stack (do not change without asking)

- Angular 22.2: standalone components, signals, `inject()`, `@if`/`@for` control flow,
  lazy `loadComponent` routes, SCSS. Unit tests run on Vitest through `ng test`; end-to-end
  tests on Playwright against the emulators.
- Firebase JS SDK 13, modular API, **no AngularFire** (it lags behind Angular releases).
- Firebase project `indab-academy` (Firestore in `southamerica-west1`). Local dev uses the
  emulators with project `demo-indab` (`environment.development.ts`, `useEmulators: true`).
- Node `^24.15.0` or `^22.22.3`; Java 21+ for the emulators. Cris develops on Windows + VS Code,
  so keep scripts cross-platform (no bash-only npm scripts).

## Firebase access

Inject the instances through the tokens in `src/app/core/firebase/firebase.providers.ts`:

```ts
import { FIRESTORE, FIREBASE_AUTH } from '../../core/firebase/firebase.providers';

private readonly firestore = inject(FIRESTORE);
```

Then call the modular SDK directly (`collection`, `query`, `where`, `onSnapshot`, `getDocs`, ...).
Never call `getFirestore()`/`getAuth()` elsewhere, or the emulator wiring is skipped.

For the current user, use `AuthService` (`src/app/core/auth/auth.service.ts`):
`user()`, `profile()`, `enrollment()`, `isLoggedIn()`, `isAdmin()`, `hasAcademyAccess()`, and
`whenReady()` before reading them in guards. Add new per-user state there only if it is global;
otherwise create a feature service.

## Access model

| Collection | Read | Write |
| --- | --- | --- |
| `users/{uid}` | owner, admins | owner creates as `student`, edits `displayName` and `photoURL`; admins change `role` of others only |
| `enrollments/{uid}` `{academy, courses[], updatedAt, updatedBy}` | owner, admins | admins (shape validated) |
| `courses/{id}` | everyone if `published`, admins | admins |
| `courses/{id}/lessons/{id}` | enrolled in course or academy access | admins |
| `materials/{id}` | academy access | admins |
| `investors/{uid}` (Eleva) | owner, admins | admins |
| `practiceSessions/{id}` + `/trades/{id}` | owner, admins | owner (academy access) while active; trades closed once; admins delete |

Rules helpers in `firestore.rules`: `signedIn()`, `isOwner(uid)`, `isAdmin()`,
`hasAcademyAccess()`, `isEnrolledIn(courseId)`. Everything not matched is denied.

Guards in `src/app/core/auth/auth.guards.ts`: `authGuard` (signed in), `guestGuard`
(signed out), `enrolledGuard` (academy access), `adminGuard` (admin role). Guards are UX only; the rules are the security.
Users can never grant themselves a role, enrollment or investor data from the client.

## Layout and conventions

```
src/app/core/firebase/   DI tokens + provideFirebase()
src/app/core/auth/       AuthService, guards
src/app/core/models/     Firestore document interfaces (one file per domain)
src/app/core/i18n/       I18n service, messages/{es,en,pt}.ts, title strategy, localDate pipe
src/app/features/<name>/ one folder per feature; components named without suffix (Landing, Academy)
src/app/shared/          reusable UI (layout/header, ...)
src/styles.scss          global tokens: --color-*, --radius, --max-width, .container, .btn
```

- File names: `feature.ts`, `feature.html`, `feature.scss`, `feature.spec.ts` (Angular 20+
  style, no `.component` suffix). Inline templates are fine for small components.
- Selectors prefixed `app-`. Prefer `protected readonly` for template-only members.
- State: signals and `computed`; convert Firestore listeners to signals in a service and
  unsubscribe on destroy (`DestroyRef`).
- Model types: `Timestamp` from `firebase/firestore` for dates; write with `serverTimestamp()`.
- Styling: black and white brand (logo `public/logo.jpg`, tagline "Conocimiento. Disciplina.
  Estrategia. Resultados."). Use the CSS variables in `src/styles.scss`, not hard-coded colors.
- UI text is translated: es-419 (default), en-US, pt-BR. Never hard-code copy in a template or
  component. Add each text to `core/i18n/messages/es.ts` and its translation to `en.ts` and `pt.ts`
  (same keys, or the build fails); read it with `inject(I18n).messages()` (`@let t = ...` in
  templates). Texts with values are functions. Dates go through the `localDate` pipe; numbers
  stay en-US (`1,250.00`). Route `title`s are keys of `messages.titles` (ending in `| INDAB`).
  Firestore content is not translated. Code, comments, commits in English. See README "Languages".
- Formatting: Prettier (`printWidth` 100, single quotes). Run `npx prettier --write` on changed files.

## Adding a module

1. **Model**: add interfaces in `src/app/core/models/<domain>.ts`.
2. **Rules**: add a `match` block in `firestore.rules` (update the data-model comment at the top)
   and tests in `tests/firestore.rules.test.ts` covering allowed and denied cases for
   anonymous, student, enrolled, owner and admin.
3. **Service**: `src/app/features/<name>/<name>.service.ts` (`providedIn: 'root'`) using `FIRESTORE`.
4. **Component(s)** in `src/app/features/<name>/`, replacing the placeholder and its
   `placeholder.scss` import.
5. **Route** in `src/app/app.routes.ts` with `loadComponent`, a `title` key (added to `titles` in
   the three message files) and the right guard.
   Add a header link in `src/app/shared/layout/header.html` if it is a main section.
6. **Indexes**: composite queries need an entry in `firestore.indexes.json`.
7. **Docs**: update the access-model and routes tables in `README.md` and this skill.
8. **Tests**: a `<name>.spec.ts` next to each component and service, and an e2e test in `e2e/` for
   the main user flow (see Testing below).
9. **Verify**: `npm run test:ci`, `npm run test:rules`, `npm run test:e2e`, `npm run build`.
   CI (`.github/workflows/ci.yml`) runs the same on every PR and push and gates every
   deploy on them; a new test script must also be added to its `test` job.

## Testing

- **Unit** (`src/**/*.spec.ts`, `npm test` / `npm run test:ci`): Vitest + TestBed, jsdom.
  Components: replace `AuthService` (or the feature service) with a `useValue` fake built from
  `signal()`s and drive the DOM. Services: fake the Firebase SDK with
  `vi.mock('firebase/firestore', ...)` and capture `onSnapshot` callbacks
  (see `auth.service.spec.ts`, `admin.service.spec.ts`). `isolate: true` in `angular.json` keeps
  `vi.mock` per file; do not turn it off.
- **Rules** (`tests/firestore.rules.test.ts`, `npm run test:rules`): allowed and denied cases.
- **E2E** (`e2e/*.spec.ts`, `npm run test:e2e`): Playwright drives `ng serve` against the Auth and
  Firestore emulators with the real rules. Each test calls `resetEmulators()` and seeds what it
  needs with `createUser()` / `setDocument()` from `e2e/emulators.ts` (REST, bypasses rules).
  Select by role and Spanish label (`getByRole`, `getByLabel`), not CSS, where possible (tests run
  in the default language unless they switch it).
  `PLAYWRIGHT_CHROMIUM_PATH` lets you use an already installed Chromium (e.g. in cloud sessions,
  `/opt/pw-browsers/chromium`) instead of `npx playwright install`.

Module notes:

- **Landing (`/`)**: public, no Firestore reads needed except published `courses`. Sections for
  the academy, courses and a link to Eleva. Call to action goes to `/register`.
- **Material repository (`/academy/material`)**: part of the academy, opened from `/academy`;
  Cris does not want it as its own header tab (`/repository` only redirects). `materials/{id}` (title, description, category, type
  such as pdf/video/link, url, createdAt). Gated by `enrolledGuard` + `hasAcademyAccess()` rule.
  If files are uploaded, use Firebase Storage with `storage.rules` mirroring the same check
  (add a `FIREBASE_STORAGE` token and emulator wiring in `firebase.providers.ts`).
- **Academy (`/academy`)**: published `courses` and their `lessons`, filtered by
  `enrollment().courses` or full academy access. Shows the pending notice when not enrolled.
- **Trading practice (`/academy/practice`, built)**: `features/practice/`. `Replay` (`replay.ts`)
  is the pure bar-by-bar engine (orders, fills, SL/TP, P/L); `ReplayChart` wraps
  lightweight-charts and its draggable price/SL/TP lines (`levelMoved`; fake it in component
  specs, it needs a canvas); `MarketDataService` loads Binance public klines in the browser
  (no key; mock them with `page.route` in e2e); `PracticeService` logs `practiceSessions` and
  their `trades`. Admin review at `/admin/practice` (`features/admin/practice-review/`): reloads the session's
  candles to draw its trades, and deletes a session with its trades (`PracticeService.deleteSession`).
  Cris wants the trading screen to look and work like TradingView, students to start with 200
  USD and trade lots (100 oz) at 1:100 with a 50% stop out (`replay.ts` constants), and
  timeframes 1m-4h switchable mid-session, starting on 15m. The replay runs on 1m candles
  loaded in chunks; `BarBuilder` (`bars.ts`) builds the chart's bars. TradingView's own
  indicators/drawings are not available to us (Advanced Charts is for public sites only), so
  chart tools (`indicators.ts`, drawings in `ReplayChart`) are built on lightweight-charts.
  Drawings listen to DOM clicks, since the chart's `subscribeClick` drops a second click within
  500 ms. Cris chose to grow this with FX Replay's best ideas rather than clone it: session
  stats (`stats.ts`, `SessionStatsPanel`), rectangle/Fibonacci, picking the start date.
  Cris wants exactly XAU/USD, USD/JPY and NASDAQ: only gold (PAXGUSDT) is live, the others
  wait for a data source licensed for display to students. Never bundle or serve data whose
  license is personal use only (e.g. Dukascopy). A new timeframe must also be added to the
  `interval` list in `firestore.rules`.
- **Eleva (`/eleva`, investor area)**: the public page stays unguarded. Investor data lives in
  `investors/{uid}` and subcollections (e.g. `investors/{uid}/statements/{month}`), admin-written,
  owner-read. Financial figures are never computed or written by the client.
- **Profile (`/profile`, built)**: `features/profile/`, opened from the avatar menu in the header
  (`shared/layout/header`, avatar in `shared/avatar`). The photo is resized in the browser
  (`resizeImage`, 192 px JPEG) and stored inline as `users/{uid}.photoURL`, so no Cloud Storage
  bucket (Blaze plan) is needed; the header falls back to the Google photo, then initials.
  `ProfileService` links an email/password credential for Google-only users (re-asking Google on
  `auth/requires-recent-login`) and changes passwords after reauthentication. The practice P/L
  summary reads the latest 50 `practiceSessions`. Linking from Google is unit-tested only: the
  emulator's Google window needs internet.
- **Admin (`/admin`, built)**: `features/admin/`. `AdminService` is provided by the `Admin`
  component (live `users` + `enrollments` listeners that stop on leave); search/filter is
  client-side in `admin-users.ts` (fine for hundreds of users; move to a paged query if it grows).
  Admins change roles (rules block changing their own) and toggle `enrollments/{uid}.academy`.
  New admin tools (courses, materials, investors) can be added as sections of this page.
  Any admin UI must still rely on rules (`isAdmin()`); never trust a client flag.

## Do not

- Commit service account keys, `.env` files or emulator exports.
- Loosen a rule without a failing-then-passing test.
- Switch the dev environment off the emulators in a commit.
- Deploy rules or hosting without Cris asking for it.
