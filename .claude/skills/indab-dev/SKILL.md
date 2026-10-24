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

The Firestore SDK is lazy (it was half of the first download): `FIRESTORE_LOADER.load()` imports
it, and `AuthService` loads it before the guards admit a signed-in user, so services of guarded
pages can `inject(FIRESTORE)`; `preloadFirestore` starts the download on login/register. Never
import `firebase/firestore` values (use `import type`) in code of the main bundle
(`app.config.ts`, `core/auth`, `shared/layout`, public pages); a public page that needs data
awaits `inject(FIRESTORE_LOADER).load()`. Check `ng build`'s initial size (about 440 kB) after
touching startup code.

For the current user, use `AuthService` (`src/app/core/auth/auth.service.ts`):
`user()`, `profile()`, `enrollment()`, `isLoggedIn()`, `isAdmin()`, `hasAcademyAccess()`, and
`whenReady()` before reading them in guards. Add new per-user state there only if it is global;
otherwise create a feature service.

## Access model

| Collection                                                       | Read                                                                        | Write                                                                                                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}`                                                    | owner, staff                                                                | owner creates as `student`, edits `displayName`, `photoURL`, `birthDate`, `whatsapp`; admins change `role` (`student`/`trainer`/`admin`) of others only   |
| `users/{uid}/sessions/{id}`                                      | owner                                                                       | each browser records itself; owner sets `revoked` once, deletes; admins delete                                                                            |
| `enrollments/{uid}` `{academy, courses[], updatedAt, updatedBy}` | owner, staff                                                                | admins (shape validated)                                                                                                                                  |
| `courses/{id}`                                                   | everyone if `published`, admins                                             | admins                                                                                                                                                    |
| `courses/{id}/lessons/{id}`                                      | enrolled in course or academy access                                        | admins                                                                                                                                                    |
| `materials/{id}`                                                 | academy access                                                              | admins                                                                                                                                                    |
| `investors/{uid}` (Eleva)                                        | owner, admins                                                               | admins                                                                                                                                                    |
| `evaluations/{id}`                                               | staff, assigned students                                                    | staff (shape validated)                                                                                                                                   |
| `practiceSessions/{id}` + `/trades/{id}`                         | owner, staff; attempts at published evaluations to academy access (ranking) | owner (academy access) while active; evaluation attempts `{evaluationId}_{uid}` once, inside the window and time limit; trades closed once; admins delete |

Rules helpers in `firestore.rules`: `signedIn()`, `isOwner(uid)`, `isAdmin()`, `isStaff()`
(trainers and admins), `emailVerified()`, `hasAcademyAccess()` (staff count as having it; needs
a verified email), `isEnrolledIn(courseId)`. Tests sign in with `email_verified: true` unless
they pass `as(uid, false)`.
Everything not matched is denied. Trainers run evaluations and review practice; anything about
users, access or deleting practice stays admin-only.

Guards in `src/app/core/auth/auth.guards.ts`: `authGuard` (signed in), `guestGuard`
(signed out), `enrolledGuard` (academy access), `staffGuard` (trainer or admin), `adminGuard` (admin role).
All but `guestGuard` first send users with an `AuthService.setupStep()` (`verifyEmail`, then
`details` while `users/{uid}.birthDate` is missing) to `/account-setup` (`setupGuard`); a new
guarded page gets that for free. E2e `createUser()` seeds verified users with a birth date.
`AuthService.isStaff()` mirrors `isStaff()`. Guards are UX only; the rules are the security.
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
- Loading: `AppLoader` (`shared/loader`) shows the logo bouncing while the app starts (static copy
  in `index.html`, styles in `styles.scss`), while the router navigates and while
  `LoadingService` tracks something. Wrap page reads with `loading.track(promise)` (or
  `begin()`/end for listeners until their first snapshot); leave background work untracked
  (e.g. `loadCandles(..., { background: true })` for the replay's next chunk). Favicons and app
  icons in `public/` are cut from the logo's mark (the M with the arrow).
- SEO: public pages are prerendered at build time (`outputMode: "static"`, `@angular/ssr`, no
  hydration) and `Seo` (`core/seo`) sets meta, canonical, `hreflang` (`?lang=es|en|pt` links) and
  Open Graph tags per route and language. Code on public pages runs once in Node at build time:
  guard browser APIs with `isPlatformBrowser` or try/catch. See README "SEO and loading speed".
- Header (`shared/layout/header`): sticky on every page (z-index 9, under the landing's progress
  bar), thinner with a shadow once scrolled; the current section's link gets `aria-current` and a
  sliding underline (`placeIndicator`). Its links: `Nosotros` and `Contáctanos` (`/#nosotros`,
  `/#contacto`, landing sections; `LandingSections` in `shared/layout` scrolls to them and the
  landing reports the section on screen so the underline follows the scroll), then Academia and
  Admin (short label on phones, so the row fits at 390 px). Eleva Inversiones is out of the header
  for now (Cris, 2026-10-24); `/eleva` and the landing's Eleva section still link to it. The language picker is a flag menu (`shared/language`:
  Mexico = es-419, USA = en-US, Brazil = pt-BR, inline SVG because Windows has no flag emoji).
  Dropdowns use the global `dropdown-in` keyframes; respect `prefers-reduced-motion`.
- Footer (`shared/layout/footer`): a thin strip in the app shell (`app.html`) on every page with
  the copyright (`© {year} INDAB y crisortizdev`) and "Desarrollado por crisortizdev" linking
  https://crisortiz.github.io; the shell keeps it at the bottom of short pages. Do not add page
  footers with their own copyright (the landing's footer only has links and the disclaimer).
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
   the three message files) and the right guard. A public page for search engines also gets
   `data: { description: '<key>' } satisfies SeoData` (texts in `seo.descriptions`), a
   `RenderMode.Prerender` entry in `app.routes.server.ts` and its URLs in `public/sitemap.xml`;
   everything else is `noindex` and browser-only.
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
  Its home is a grid of illustrated cards, one per section (`cards` in `academy.ts`, inline SVG
  art in `academy.html`); without academy access the same cards show locked. Add a card there
  (and to `academy.cards` in the three message files) for each new academy section.
- **Trading practice (`/academy/practice`, built)**: `features/practice/`. `Replay` (`replay.ts`)
  is the pure bar-by-bar engine (orders, fills, SL/TP, P/L); `ReplayChart` wraps
  lightweight-charts and its draggable price/SL/TP lines (`levelMoved`; the order being set up
  only appears once picked from the "+" menu (`orderAt`) or the order panel is used, and is set up
  on its line (`draftTypeChanged`, `lotsChanged`, `levelAdded`, `draftDiscarded`); fake it in component
  specs, it needs a canvas); `MarketDataService` loads Binance public klines in the browser
  (no key; mock them with `page.route` in e2e); `PracticeService` logs `practiceSessions` and
  their `trades`. Admin review at `/admin/practice` (`features/admin/practice-review/`) and the
  student's "Your sessions" list open a `SessionReview` (`session-review.ts`): it reloads the
  session's candles, draws each filled trade as TradingView's long/short position box
  (`trade-boxes.ts`, `ReplayChart` `positionBoxes`; in a live practice only closed trades get one)
  and steps through them with `TradeNavigator` (previous/next, a list, details), scrolling the
  chart to each (`focusTrade`). Admins delete a session with its trades (`PracticeService.deleteSession`).
  Cris wants the trading screen to look and work like TradingView, students to start with 200
  USD and trade lots (100 oz) at 1:100 with a 50% stop out (`replay.ts` constants), and
  timeframes 1m-4h switchable mid-session, starting on 15m. The replay runs on 1m candles
  loaded in chunks; `BarBuilder` (`bars.ts`) builds the chart's bars. TradingView's own
  indicators/drawings are not available to us (Advanced Charts is for public sites only), so
  chart tools (`indicators.ts`, drawings in `ReplayChart`) are built on lightweight-charts.
  Drawings follow pointer events on the DOM (the chart's `subscribeClick` drops a second click
  within 500 ms) and are an SVG overlay, as in TradingView's app (Cris sent a recording): a tap
  or click puts each point, a finger can drag a crosshair and let go, a tap selects a drawing
  (handles reshape it, a drag moves it, a bar recolors or deletes it). The chart's top bar holds
  the timeframes (projected with `chartToolbar`) and one menu each for indicators and drawings.
  Cris chose to grow this with FX Replay's best ideas rather than clone it: session
  stats (`stats.ts`, `SessionStatsPanel`), rectangle/Fibonacci, picking the start date.
  Gold is Binance Futures' XAUUSDT perpetual (PAXGUSDT, a thin token, looked nothing like the
  market and is kept only for old sessions); `MarketDataService` drops bars while spot gold is
  closed and empty minutes (`goldHours`), paging until it has the requested count, and
  `loadHistory` reads backwards from the replay start. Candles use TradingView's colors.
  Cris wants exactly XAU/USD, USD/JPY and NASDAQ: only gold (XAUUSDT) is live, the others
  wait for a data source licensed for display to students. Never bundle or serve data whose
  license is personal use only (e.g. Dukascopy). A new timeframe must also be added to the
  `interval` list in `firestore.rules`.
- **Evaluations and ranking (built)**: `evaluations/{id}` (`core/models/evaluation.ts`,
  `features/evaluations/evaluation.service.ts`) are set up at `/admin/evaluations`
  (`features/admin/evaluations/`). Students see theirs above the practice setup and take each
  once; the attempt is a practice session with id `{evaluationId}_{uid}`, `evaluationId` and
  `durationMinutes`, and the page counts down and finishes it; free sessions store
  `evaluationId: null`. `/academy/ranking` (`features/ranking/`, ranking maths in
  `standings.ts`) ranks only evaluations, by attempt P/L: Cris does not want free practice
  ranked, so free sessions stay private to the student and staff. Students see an evaluation's ranking
  only after staff publish it. P/L is client-computed: not a trusted grade.
- **Economic calendar (`/academy/calendar`, built)**: `features/calendar/`. TradingView's free
  calendar widget (`widget.ts` builds its settings: locale, economies, impact); the page rebuilds
  the embed when a filter or the language changes, keeps TradingView's credit link, and adds a
  translated guide to the news that moves gold, USD/JPY and the NASDAQ. Cris wants it free for
  life: no paid API, key or server function. E2e tests stub the widget script with `page.route`.
- **Eleva (`/eleva`, investor area)**: the public page stays unguarded. Investor data lives in
  `investors/{uid}` and subcollections (e.g. `investors/{uid}/statements/{month}`), admin-written,
  owner-read. Financial figures are never computed or written by the client.
- **Account setup and sessions (built)**: registration asks for the birth date (required) and
  WhatsApp (optional, stored as `+digits`); validators and helpers in `shared/personal-details`
  (each form shows the fields itself so its styles apply). `AuthService` sends the confirmation
  email and `checkEmailVerified()` reloads the user and refreshes the ID token (the rules read the
  flag from it). `core/auth/session-tracker.ts` (lazy, with Firestore) records each browser in
  `users/{uid}/sessions` (id kept in `localStorage`), signs it out when it sees `revoked`
  (`/login?ended=1`) and deletes it on sign-out; `/profile` lists them (`SessionsService`).
  Revoking only asks that browser to sign out: Cris wants $0, so no Admin SDK token revocation.
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
  Trainers open `/admin` too but only see links to evaluations and the practice review
  (`AdminService` opens no listeners for them).
  New admin tools (courses, materials, investors) can be added as sections of this page.
  Any admin UI must still rely on rules (`isAdmin()`); never trust a client flag.

## Do not

- Commit service account keys, `.env` files or emulator exports.
- Loosen a rule without a failing-then-passing test.
- Switch the dev environment off the emulators in a commit.
- Deploy rules or hosting without Cris asking for it.
