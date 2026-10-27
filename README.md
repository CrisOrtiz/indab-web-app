# INDAB web app

Web app for **INDAB Academy** and **Eleva Inversiones**.

- **INDAB Academy** teaches trading. The app has a public landing page, accounts (email/password
  and Google), an academy area for students and a repository of learning material that only
  enrolled students can open.
- **Eleva Inversiones** is INDAB's investment arm. It pools investor money, trades with it and
  pays investors a monthly return. The app has a public Eleva page and investor accounts
  (`investors/{uid}`) that only the investor and INDAB admins can read.

Built with Angular 22 (standalone components, signals, SCSS) and Firebase Authentication and
Cloud Firestore through the modular Firebase JS SDK (no AngularFire). The UI is in Latin American
Spanish (default), English and Brazilian Portuguese; see [Languages](#languages).

## Requirements

| Tool    | Version                                        | Why                                                                                                                      |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Node.js | `^24.15.0` (recommended), `^22.22.3` or `>=26` | Angular 22 CLI refuses older versions (e.g. Node 22.13 fails with an `EBADENGINE` / "unsupported Node.js version" error) |
| npm     | 11 (ships with Node 24)                        |                                                                                                                          |
| Java    | 21+                                            | Firebase emulators (Auth + Firestore)                                                                                    |
| Git     | any recent                                     |                                                                                                                          |

Check with `node -v`, `npm -v` and `java -version`. On Windows, install Node 24 LTS from
[nodejs.org](https://nodejs.org/) (or `nvm-windows`: `nvm install 24` then `nvm use 24`) and a JDK
such as [Eclipse Temurin 21](https://adoptium.net/). Open a new terminal afterwards so `PATH` updates.

The Angular CLI and Firebase CLI are dev dependencies, so there is nothing to install globally:
use `npx ng ...` and `npx firebase ...` (or the npm scripts below).

## Getting started

```bash
git clone https://github.com/CrisOrtiz/indab-web-app.git
cd indab-web-app
npm install
```

Run the emulators and the dev server in two terminals:

```bash
# terminal 1: Auth + Firestore emulators, Emulator UI at http://127.0.0.1:4000
npm run emulators

# terminal 2: dev server at http://localhost:4200 (same as `npx ng serve`)
npm start
```

The development environment (`src/environments/environment.development.ts`) points at the
emulators with the offline project `demo-indab`, so no real Firebase project or credentials are
needed to develop. Emulator data is thrown away when they stop. To keep it between runs:

```bash
npx firebase emulators:start --project demo-indab --only auth,firestore --import=.emulator-data --export-on-exit
```

(`.emulator-data/` is git-ignored.)

### Making yourself an admin or enrolled locally

1. Register at http://localhost:4200/register.
2. In the Emulator UI (http://127.0.0.1:4000/firestore), open `users/{your uid}` and set `role` to
   `admin`, or create `enrollments/{your uid}` with `academy: true` (boolean) and `courses: []`.
3. The app reacts immediately; `/academy/material` opens.

## Tests

```bash
npm test             # unit tests (Vitest through the Angular CLI), watch mode
npm run test:ci      # unit tests once, with a coverage report in coverage/
npm run test:rules   # Firestore security rules tests; starts the Firestore emulator itself (needs Java)
npm run test:e2e     # browser tests (Playwright); starts the emulators and ng serve itself (needs Java)
npm run test:all     # all three, as CI runs them
```

| Suite      | Where                           | What it covers                                                                                                                                                                                                     |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit       | `src/**/*.spec.ts`              | `AuthService`, guards, routes, login/register forms, admin page and service, header. Firebase is faked with `vi.mock`, no emulator needed.                                                                         |
| Rules      | `tests/firestore.rules.test.ts` | every collection in `firestore.rules`, allowed and denied, for visitor, student, enrolled, owner and admin                                                                                                         |
| End-to-end | `e2e/*.spec.ts`                 | the real app in Chromium against the Auth + Firestore emulators: register, login, guards, sign-out, admin grants access and promotes users, a practice replay is logged, reviewed and deleted (market data mocked) |

Before the first `npm run test:e2e`, install the browser once with `npx playwright install chromium`.
The e2e tests wipe the emulator data on every test, so stop `npm run emulators` before running them.
If a test fails, `npx playwright show-report` opens the report with screenshots and traces.

Every change to `firestore.rules` should come with a test in `tests/firestore.rules.test.ts`, and
every new page or user flow with a unit test and, for a main flow, an e2e test in `e2e/`.

## Firebase project and deploys

The real Firebase project is **`indab-academy`** (Firestore in `southamerica-west1`, Santiago;
Email/Password and Google sign-in enabled). Its web config is in `src/environments/environment.ts`.
Those values are public identifiers; access is enforced by the security rules.

```bash
npx firebase login          # once per machine
npm run deploy:rules        # deploy firestore.rules and firestore.indexes.json
npm run deploy              # production build + deploy to Firebase Hosting
```

`.firebaserc` makes `indab-academy` the default project, so no `--project` flag is needed.

### Hosting

The site is served from Firebase Hosting at **https://indab-academy.web.app** (also
`indab-academy.firebaseapp.com`). `firebase.json` serves `dist/indab-web-app/browser`: the
prerendered public pages (`index.html`, `eleva/index.html`, ...; see [SEO](#seo-and-loading-speed))
as they are, and every other route through `index.csr.html` (so deep links like `/academy` work).
Hashed JS/CSS are cached for a year; HTML is always revalidated. Manual deploy from your machine:

```bash
npx firebase login   # once per machine, opens the browser
npm run deploy       # ng build + firebase deploy --only hosting
```

If the CLI reports that no Hosting site exists, open **Hosting** in the Firebase console, click
**Comenzar** once, and run `npm run deploy` again. Both hosting domains are in **Authentication >
Settings > Authorized domains** by default; add any custom domain there too, or Google sign-in fails on it.

### CI/CD (GitHub Actions)

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Build and test**: `npm run build`, `npm run test:ci`, `npm run test:rules` and
   `npm run test:e2e` (Node 24, Java 21 for the emulators). Nothing deploys unless this job passes.
   The coverage report and, on failure, the Playwright report are attached to the run.
2. **Deploy preview** (pull requests): a temporary preview URL posted as a PR comment. It is
   deleted when the PR is merged or closed (`.github/workflows/preview-cleanup.yml`) and expires
   after 1 day anyway. To delete every preview now: **Actions > Delete previews > Run workflow**.
3. **Deploy live site** (push to `main`): https://indab-academy.web.app, using the build that was tested.
4. **Deploy Firestore rules** (push to `main`, opt-in): `firestore.rules` and
   `firestore.indexes.json`, only when the repository variable `DEPLOY_FIRESTORE_RULES` is `true`.

The deploy jobs need the repository secret `FIREBASE_SERVICE_ACCOUNT_INDAB_ACADEMY`; without it
they are skipped and only the tests run. To create the secret (and a service account with the
Hosting roles) run, from the repo folder:

```bash
npx firebase init hosting:github
```

Pick repository `CrisOrtiz/indab-web-app`; it uploads the secret to GitHub for you. Answer **No**
to the build-script and automatic-deploy questions, and don't commit the
`firebase-hosting-pull-request.yml` / `firebase-hosting-merge.yml` files it writes: delete them,
`ci.yml` already covers both.

To also deploy rules from CI:

1. In [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam?project=indab-academy), edit
   the `github-action-...@indab-academy.iam.gserviceaccount.com` account the command created and add
   the roles **Firebase Rules Admin**, **Cloud Datastore Index Admin** and **Service Usage Consumer**.
2. In GitHub, **Settings > Secrets and variables > Actions > Variables**, add
   `DEPLOY_FIRESTORE_RULES` = `true`.

Recommended: in **Settings > Branches**, protect `main` and require the **Build and test** check, so
a pull request with failing tests cannot be merged. Deploy jobs run in the `production`
environment, where you can add required reviewers if you want to approve each live deploy.

To run `ng serve` against the real project instead of the emulators, copy the config from
`environment.ts` into `environment.development.ts` and set `useEmulators: false` (do not commit that change).

Promote the first admin in the Firebase console: **Firestore Database** > `users/{uid}` of your
account > set `role` to `admin`.

Never commit service account keys (`*-firebase-adminsdk-*.json`, `service-account*.json`) or
`.env` files; they are git-ignored. For CI or automated deploys, pass the key through an
environment variable / secret and point `GOOGLE_APPLICATION_CREDENTIALS` at a temporary file.
The service account needs the _Firebase Admin_ and _Service Usage Consumer_ roles for `firebase deploy`.

## Access model

| Collection                                                       | Who can read                                                                                                                         | Who can write                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users/{uid}`                                                    | owner, trainers, admins                                                                                                              | owner creates as `student` and edits `displayName`, `photoURL` (an inline JPEG/PNG/WebP `data:` URL up to 100,000 characters), `birthDate` (`YYYY-MM-DD`) and `whatsapp` (`+` and 8-15 digits, optional); admins change `role` to `student`, `trainer` or `admin` and a student's `mentorshipIds` (not their own)      |
| `users/{uid}/sessions/{id}` (browsers signed in)                 | owner                                                                                                                                | each browser creates its own entry and refreshes `lastSeen`; the owner signs one out by setting `revoked` (once) and deletes entries; admins delete                                                                                                                                                                    |
| `enrollments/{uid}` `{academy, courses[], updatedAt, updatedBy}` | owner, trainers, admins                                                                                                              | admins                                                                                                                                                                                                                                                                                                                 |
| `courses/{id}`                                                   | everyone if `published`, admins                                                                                                      | admins                                                                                                                                                                                                                                                                                                                 |
| `courses/{id}/lessons/{id}`                                      | users enrolled in that course or with academy access                                                                                 | admins                                                                                                                                                                                                                                                                                                                 |
| `materials/{id}`                                                 | users with academy access (`enrollments/{uid}.academy == true`), admins                                                              | admins                                                                                                                                                                                                                                                                                                                 |
| `investors/{uid}` (Eleva)                                        | owner, admins                                                                                                                        | admins                                                                                                                                                                                                                                                                                                                 |
| `mentorships/{id}` (group of students and their mentors)         | trainers, admins; students read the ones in their `users/{uid}.mentorshipIds`                                                        | admins (shape validated: name, mentors, start/end `YYYY-MM-DD`, `active`); deleting one also takes it off its students                                                                                                                                                                                                 |
| `evaluations/{id}` (timed practice evaluation)                   | trainers, admins, assigned students (in `studentIds` or in one of its `mentorshipIds`)                                               | trainers and admins (shape validated)                                                                                                                                                                                                                                                                                  |
| `practiceSessions/{id}` (chart replay)                           | owner, trainers, admins; attempts at evaluations with published results also to everyone with academy access, for the ranking        | owner with academy access creates it and updates its summary until `finished`; an evaluation attempt has the id `{evaluationId}_{uid}` (one per student), must start inside the window on the evaluation's settings, and is locked 2 minutes after its time limit; admins delete                                       |
| `practiceSessions/{id}/trades/{id}`                              | session owner, trainers, admins                                                                                                      | session owner opens trades while the session is active (and, in an evaluation, before the time is up) and closes each once (entry never editable); admins delete                                                                                                                                                       |
| `examForms/{id}` (evaluation form, no answers)                   | trainers, admins; published forms to their assigned students (`audience` `all`, in `studentIds` or in `mentorshipIds`)               | trainers and admins (shape validated); trainers and admins delete                                                                                                                                                                                                                                                      |
| `examKeys/{examId}` (right answers)                              | trainers, admins; students once results with answers are published                                                                   | trainers and admins                                                                                                                                                                                                                                                                                                    |
| `examSubmissions/{examId}_{uid}_{n}` (attempt)                   | owner, trainers, admins                                                                                                              | owner with academy access starts attempt `n` (up to `maxAttempts`, inside the window, after the previous one is handed in) and saves answers until handing in or 2 minutes after its deadline                                                                                                                          |
| `examGrades/{submissionId}`                                      | trainers, admins; the student once results are published                                                                             | trainers and admins, for an existing attempt                                                                                                                                                                                                                                                                           |
| `mentorNotes/{id}` (a mentor's note)                             | trainers, admins; the student it is about                                                                                            | admins on any student's work; trainers and admins who mentor one of the student's mentorships (named in `mentorshipId`); on the student's own practice session, evaluation attempt or form attempt; the author edits, the author or an admin deletes                                                                   |
| `users/{uid}/notifications/{id}` (the bell)                      | owner                                                                                                                                | the sender, once per event (the id names it): a note's author in the same batch as the note; staff for an evaluation or form given to the student or its published results; a student for their own finished practice, evaluation or handed-in form, to staff who follow them for it; the owner marks read and deletes |
| `users/{uid}/settings/notifications`                             | owner                                                                                                                                | trainers and admins, their own (what they follow and which activity they hear of)                                                                                                                                                                                                                                      |
| `follows/{kind}/subjects/{id}/followers/{uid}`                   | that trainer or admin; students, the lists of what concerns them (themselves, their mentorships, their evaluations and forms, `all`) | that trainer or admin (`types`: `practiceFinished`, `evaluationFinished`, `examSubmitted`)                                                                                                                                                                                                                             |

A user gets access to the academy and the material repository when an admin turns on
"Acceso a la academia" for them in `/admin/users` (the "Usuarios" card in `/admin`, which
writes `enrollments/{uid}` with `academy: true`). Admins also promote or demote other users
there. The first admin has to be set by hand: in the Firebase console, open `users/{uid}` for
that account and change `role` to `admin`. Admins cannot remove their own admin role, so there is always at least one.
Trainers (role `trainer`, appointed by an admin) have academy access, set up practice evaluations
and evaluation forms, grade them and review practice, but cannot change roles, academy access or
mentorships, or delete practice sessions. The route guards mirror these checks in the UI, but
the rules are what actually protect the data. Anything not listed is denied.

Academy content (material, lessons, practice, ranking) also needs a confirmed email
(`request.auth.token.email_verified`): Google accounts have it, and email sign-ups confirm the
link sent at registration. Until then, and while an account has no `birthDate` (Google and
older accounts), every guarded page sends the user to `/account-setup`.

Open sessions (`/profile`) are tracked in Firestore because the client SDK cannot list or revoke
another browser's sign-in. Signing a session out flags it, and that browser signs itself out as
soon as it is online; true token revocation needs the Admin SDK (a Cloud Function, Blaze plan).
Changing the password does revoke every other session, since Firebase ends them on that change.

## Routes

| Path                             | Access                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` landing, `/eleva`            | public                                                                                                                                          |
| `/login`, `/register`            | signed-out visitors                                                                                                                             |
| `/account-setup`                 | signed-in users who still have to confirm their email or give their birth date (the other guards send them here)                                |
| `/academy`                       | signed-in users (shows "pending" until enrolled)                                                                                                |
| `/profile`                       | signed-in users (photo, name, birth date, WhatsApp, password, open sessions, language, practice P/L; opened from the avatar menu in the header) |
| `/academy/material`              | enrolled users (learning material, opened from the academy; `/repository` redirects here)                                                       |
| `/academy/practice`              | enrolled users (chart-replay trading practice: free practice and assigned evaluations)                                                          |
| `/academy/practice/sessions/:id` | enrolled users and staff (one practice session or evaluation attempt with its review and mentor notes; notifications link here)                 |
| `/academy/ranking`               | enrolled users (rankings of published evaluations)                                                                                              |
| `/calendar`                      | public (live economic calendar, TradingView's free widget; in the header, prerendered)                                                          |
| `/academy/calendar`              | signed-in users (same page as `/calendar`, with a link back to the academy)                                                                     |
| `/academy/exams`                 | enrolled users (assigned evaluation forms: answer, see grades; `/academy/exams/:id` takes one)                                                  |
| `/admin`                         | trainers and admins (a card per tool; trainers do not get the users card)                                                                       |
| `/admin/mentor`                  | trainers and admins (mentor dashboard: practice, averages and pending work of each mentorship they lead; admins see all)                        |
| `/admin/users`                   | admins (users, roles, academy access and each student's mentorships)                                                                            |
| `/admin/mentorships`             | trainers and admins (admins create, edit, pause and delete mentorships; trainers see them and their students)                                   |
| `/admin/practice`                | trainers and admins (review students' practice sessions on the chart; admins delete them)                                                       |
| `/admin/evaluations`             | trainers and admins (set up timed evaluations, see and publish their results)                                                                   |
| `/admin/forms`                   | trainers and admins (build scored evaluation forms; `/admin/forms/:id` grades submissions and publishes results)                                |

## Languages

The site speaks Spanish (Latin America, `es-419`, the default), English (`en-US`) and Brazilian
Portuguese (`pt-BR`). Visitors pick the language from the flag menu in the header (Mexico, USA,
Brazil); the choice is saved in the browser (`localStorage`, key `indab.language`) and the page
switches without reloading.

Translation happens at runtime, not with Angular's build-time `@angular/localize`: that would build
one copy of the site per language under `/es/`, `/en/`, `/pt/` and need a full reload to switch,
which complicates the single Firebase Hosting site and its rewrites. No i18n library is used either
(same reason as skipping AngularFire: they lag Angular releases).

- `src/app/core/i18n/messages/es.ts` holds every text and defines the `Messages` type;
  `en.ts` and `pt.ts` must have exactly the same keys, so a missing translation fails the build.
  Texts with values are functions, e.g. `count: (shown, total) => ...`.
- `I18n` (`i18n.service.ts`): `messages()` and `language()` signals and `use(language)`. Spanish
  is bundled; English and Portuguese are lazy chunks loaded the first time they are picked.
- Templates read `i18n.messages()` (often through `@let t = i18n.messages().section;`).
- Route `title`s are keys of `messages.titles`, translated by `I18nTitleStrategy`.
- Dates use the `localDate` pipe, which follows the language. Numbers and prices keep the
  `1,250.00` format traders expect in every language.
- `<html lang>` and Firebase Auth emails (password reset) follow the language too.
- A `?lang=en` (or `es`, `pt`) link opens the site in that language without saving it; search
  engines use these links (see [SEO](#seo-and-loading-speed)).
- Content stored in Firestore (course and material titles, students' names) is not translated.

To add a text: add it to `es.ts`, then to `en.ts` and `pt.ts` (the build tells you if one is
missing). To add a language: a new file in `messages/`, an entry in `LANGUAGES` and `loaders` in
`i18n.service.ts`, and its Angular locale data in `local-date.pipe.ts`.

## Light and dark mode

Signed-in users pick **Sistema / Claro / Oscuro** in the account menu (their photo in the
header). Visitors and anyone on "Sistema" follow the device's setting, live. The choice is
saved in the browser (`localStorage` key `indab.theme`), not in Firestore.

- `ThemeService` (`src/app/core/theme`) sets `data-theme="light|dark"` on `<html>`;
  `src/styles.scss` redefines the color tokens for dark. Use the tokens, never fixed colors.
- A small script in `src/index.html` sets the attribute before the page paints, so prerendered
  pages do not flash white.
- The practice chart re-reads the tokens when the theme changes; the logo is inverted.

## SEO and loading speed

- **Prerendering**: `ng build` renders the public pages (`/`, `/eleva`, `/calendar`, `/login`, `/register`,
  listed in `src/app/app.routes.server.ts`) to static HTML in Spanish (`outputMode: "static"`,
  `@angular/ssr`, no server needed, so it works on the free Spark plan). Search engines and link
  previews (WhatsApp, Facebook, LinkedIn) read their text and tags without running JavaScript.
  The browser then starts the app over that HTML (no hydration, because the visitor's language
  may differ). Code that touches `window`, `localStorage` or `IntersectionObserver` must cope
  with running at build time (`isPlatformBrowser`, or try/catch like `I18n`).
- **Meta tags**: `Seo` (`src/app/core/seo/seo.service.ts`) sets the description, robots,
  canonical link, `hreflang` alternates and Open Graph / Twitter tags for each route and language.
  Public routes carry `data: { description: '<key>' } satisfies SeoData` (texts in
  `messages.seo.descriptions`); every other route is `noindex`. Share image: `public/og-image.png`.
- **Language links**: `?lang=es|en|pt` opens the site in that language for the visit (not saved);
  search engines get those links as the English and Portuguese versions of each public page.
- **Crawler files**: `public/robots.txt` (keeps crawlers out of the signed-in areas) and
  `public/sitemap.xml` (public pages in the three languages). The JSON-LD organization data is in
  `src/index.html`. Add a new public page to `app.routes.server.ts` and the sitemap.
- **Lazy loading**: every page is a lazy route; the chart library, English/Portuguese texts and
  `@angular/forms` load only where used. The Firestore SDK (about 470 kB of the old 918 kB
  first download) loads only once someone signs in or opens login/register: `FIRESTORE_LOADER`
  loads it, and `AuthService` awaits it before the guards let a signed-in user in, so the
  services of signed-in pages can still `inject(FIRESTORE)`. A public page that needs Firestore
  must `await inject(FIRESTORE_LOADER).load()` instead.

## Installable app (PWA)

- **Manifest**: `public/manifest.webmanifest` (`display: standalone`, icons cut from the logo's
  mark, a maskable one for Android). iOS reads the `apple-touch-icon` and the
  `apple-mobile-web-app-*` tags in `src/index.html`.
- **Service worker**: production builds only (`serviceWorker` in `angular.json`,
  `provideServiceWorker` in `app.config.ts`, registered once the app is stable).
  `ngsw-config.json` caches the app's own files: the JS/CSS and `index.csr.html` up front (the
  app shell for every page, also offline), images on first use. Firestore, Auth, Binance candles
  and the TradingView widget are other origins and always go to the network; nothing is cached as
  data. Navigation never captures `/__/*` (Firebase's reserved URLs).
- **Updates**: `AppUpdates` (`core/pwa`) checks for a new deploy when the app comes back to the
  screen and every 30 minutes; once it is downloaded, a banner (`shared/pwa/update-banner`) offers
  to reload. Hosting serves `ngsw-worker.js`, `ngsw.json` and the manifest with `no-cache`, and
  only hashed bundles (`name-XXXXXXXX.js|css`) as immutable (`firebase.json`).
- **Install option**: `AppInstall` keeps Chrome/Edge/Android's install prompt (an early listener
  in `index.html` catches it before the app starts) and shows "Instalar app" in the account menu
  and the footer. On iPhone/iPad, which have no prompt, it opens Share > Add to Home Screen
  instructions (`shared/pwa/install-help`). Inside the installed app the option is hidden.
- **Testing it**: `ng serve` has no service worker. Run `npm run build` and serve
  `dist/indab-web-app/browser` with `npx firebase emulators:start --only hosting`, then open
  http://localhost:5000 (Chrome DevTools > Application shows the manifest and worker).
- Push notifications are not set up (they need a server to send them).

## Trading practice (chart replay)

`/academy/practice` replays real historical candles bar by bar. For now the only market is
gold, through Binance Futures' XAUUSDT perpetual (listed January 2026), which follows spot
XAU/USD closely. Candles come from Binance's public futures market-data API
(`fapi.binance.com/fapi/v1/klines`): free, no API key, fetched by each student's browser. Like
TradingView's XAU/USD, the chart leaves out the hours spot gold is closed (Friday 17:00 to Sunday
18:00 New York time and the daily 17:00-18:00 break, `market-hours.ts`) and minutes with no
trades; replays never start while it is closed. Older sessions on PAXG/USDT (the gold token used
before, thin and traded on weekends) still load from the spot API for review. USD/JPY and NASDAQ
are planned but need a data source licensed for showing prices to students (Dukascopy's free
feed is for personal use only, and free APIs don't allow display to third parties).

Each session starts at a random moment or on a date the student picks (on a 4-hour boundary, at
least 30 days before today), with the dates optionally hidden. The replay runs on one-minute candles, fetched 1000 at a time
as it goes, and the chart builds them into bars of the timeframe the student picks: 1m, 3m, 5m,
15m (the default), 1h or 4h, switchable at any time; each timeframe shows its 1000 bars of
history before the start. Every bar is the open of its first minute, the highest high, lowest
low and close of its last, so the timeframes agree (a 3m bar is three 1m bars, a 1h bar four 15m
bars, the bar in the making included); a test in `practice.spec.ts` checks this across all six.
"Siguiente vela" shows the next bar of that timeframe, and orders, stops and the stop out are
checked minute by minute.

Students start with 200 virtual USD and trade in lots (1 lot = 100 oz) with 1:200 leverage: a
position ties up 0.5% of its value as margin (about 20 USD per 0.01 lots with gold near 4,000), and every position is closed (stop out) when equity
falls below 50% of the margin in use. Orders are market, limit or stop, with optional stop loss
and take profit. The screen follows TradingView: one-click Buy/Sell over the chart, an order
panel with Market/Limit/Stop tabs, lots with their margin, and take profit / stop loss switches
that show their P/L and the reward to risk, plus an account summary and Positions / Orders /
History tabs under the chart. Every order, position, stop loss and take profit is a line on the
chart with a label showing its size and P/L and a × to close, cancel or remove it; order prices
and stops can be dragged by the line or the label. Students can hold several positions and
pending orders at once, as far as the margin goes: labels that would cover each other are
stacked below their lines with a dashed leader, and a chip under the one-click box counts the
live positions and orders (a tap opens their list). A refused one-click order says why right
under the box, with the lots the free margin still covers. As in TradingView, nothing is on the chart
until the student adds an order: the "+" next to the price scale (under the pointer, or where a
finger taps on a phone) offers a buy or sell limit/stop at that price, "add order" or a
horizontal line. The order then shows as a line with its Buy/Sell button (off, with a "!" saying
why, while it cannot be placed), its lots (a quantity pad), its order type (a Market/Limit/Stop
menu), TP and SL tabs to drag out (or click for a default distance) with the profit or loss band
shaded, and a × to discard it. Dragging a TP/SL back onto its entry removes it; dragging up or
down from an open position pulls out a new one. Working on the order panel shows its order on
the chart too. The bar on top of the chart has the timeframes and two menus: indicators (EMA 100
and EMA 200, shown from the start, and RSI 14 in its own pane, computed only from the bars shown)
and drawings in TradingView's sections (trend line, ray, extended line, arrow, horizontal line and
ray, vertical line, parallel channel, rectangle, Fibonacci retracement, long and short positions
with target, stop and risk/reward, and price range). Drawings work as in
TradingView's app: tap or click each point, or on a phone drag the crosshair and let go; tap a
drawing to select it, drag its handles or body to adjust it, and recolor or delete it from its bar. A Statistics tab, the end screen and the admin
review show the session's win rate, profit factor, average win and loss, maximum drawdown and
equity curve.

Sessions and orders are written to Firestore as they happen; admins review them at
`/admin/practice`, where each session's trades are drawn on its candles (fetched again from
Binance) and a session can be deleted with its trades.

### Long lists: filters and pages

The student's "Your sessions" list (10 per page) and `/admin/practice` (20 per page) read one
page at a time with Firestore cursors (`limit` + `startAfter`), filtered in the query by student
(staff only), free practice or one evaluation, status and start date, so a long history never
loads at once. Each combination of `uid`, `evaluationId` and `status` with `startedAt` has a
composite index in `firestore.indexes.json` (deploy them with the rules). The staff totals come
from one aggregation query (`count` + `sum`). Free-practice filtering matches `evaluationId ==
null`, so sessions logged before evaluations existed only show under "All". Evaluation rankings
and form results load every attempt (one per assigned student, needed to rank them) and filter
and page in the browser.

### Evaluations and ranking

Free practice is open at any time and builds each student's record. Trainers and admins also set
up **evaluations** at `/admin/evaluations`: a market and replay start shared by every student,
whether dates are hidden, a time limit (5 to 600 minutes), a window to start in, and the
assigned students. A student sees their evaluations above the practice setup and takes each one
once; a countdown runs and the attempt finishes by itself when the time is up (leaving the page
also ends it). The rules enforce the single attempt, the window, the settings and the time limit.
Results stay with the staff until a trainer publishes them.

`/academy/ranking` ranks only evaluations (Cris's choice: free practice is not ranked and stays
private to the student and staff): each published evaluation by the attempt's P/L, fewer
trades first on a tie.

### Mentorships

A **mentorship** groups students under one or more mentors (trainers or admins), with a start
date, an optional end date and an active flag. Admins manage them at `/admin/mentorships` and add
or remove each student's mentorships from `/admin/users` (a student can be in several). Forms and
practice evaluations can then be assigned to whole mentorships as well as to students picked by
name: students who join a mentorship later get what was assigned to it, and the ones who leave
stop getting it. Membership is stored on the student (`users/{uid}.mentorshipIds`) so the rules
can check it. The staff lists (practice review, evaluation results and form results) filter by
mentorship; the practice review filters the first 30 students of a mentorship (Firestore's `in`
limit), or one student. Inactive mentorships keep their students but are not offered for new
assignments. Trainers see the mentorships and their students but only admins change them.

### Mentor notes and notifications

Mentors leave **notes** on a student's practice sessions, evaluation attempts and form attempts
(the session review, and the grading panel of `/admin/forms/:id`). Admins write on anyone's work;
trainers (and admins) on the work of students in a mentorship they lead. The student reads them
under the same review (`/academy/practice`, `/academy/practice/sessions/:id`, `/academy/exams/:id`).

The **bell** in the header lists the latest 30 notifications with the unread count. Students are
told of a mentor's new note, an evaluation or form given to them, and published results.
Trainers and admins only hear of what they follow, chosen in `/profile` ("Notificaciones"):
everyone, mentorships, students, evaluations or forms, and which activity (a finished free
practice, a finished evaluation, a handed-in form). Nothing is followed until they pick it, so
nobody gets notifications they did not ask for. There is no server on the free plan, so whoever
causes an event writes the notification into each recipient's list from the browser: the rules
check that the event happened and that the sender may tell that person (e.g. the recipient
follows them), and the notification's id names the event, so each one arrives once.

### Mentor dashboard

`/admin/mentor` (the first `/admin` card) shows one mentorship at a time: trainers pick among the
ones they lead, admins among all. For a period (this week from Monday, the last 30 or 90 days) it
shows who practised, each student's sessions, closed trades, winning share and P/L, the group's
averages (P/L per active student, winning trades, form grades, evaluation P/L), and the published
forms and practice evaluations given to the group whose window touched the period, with who has
not handed them in. Practice is counted with aggregation queries per student (sessions: count and
sum of `pnl`; trades: a staff-only collection group query on `trades` by `uid`, `status` and
`closedAt`, with and without `pnl > 0`), so reads stay a handful per student however much they
traded. Links open the practice review filtered to the student (`?student=uid`), a form's results
and an evaluation's results (`/admin/evaluations?results=id`).

### Evaluation forms

Separate from the chart evaluations, trainers and admins build **evaluation forms**
(questionnaires) at `/admin/forms`: a total score and the score to pass, questions of four
types (one answer, several answers with optional partial credit, true/false, open answer) each
worth some points (the points must add up to the total before publishing), an optional time
limit, 1 to 3 attempts, a window and who takes it (every student, or the mentorships and students picked). Drafts stay
hidden. Students find them at `/academy/exams`, answer one question per screen (saved as they go,
handed in by them or when the time is up) and, once staff publish the results, see their best
grade, the points per question and the trainer's comments (and the right answers, if staff
choose to show them). Staff grade at `/admin/forms/:id`: closed questions come scored from the
answer key, open ones are graded by hand. The right answers live in `examKeys`, which students
cannot read until then. The suggested scores are computed in the staff browser, so no server
(Blaze plan) is needed.

`/calendar` (public, in the header; `/academy/calendar` is the same page with a link back to the
academy) embeds TradingView's free
[economic calendar widget](https://www.tradingview.com/widget-docs/widgets/calendars/economic-calendar/):
the scheduled news with forecast, previous and actual figures, updated live by TradingView, in
the site's language. Visitors filter it by economy (US and Japan by default) and impact, picked
with ForexFactory-style folders (red high, orange medium, yellow low). The widget is TradingView's
iframe, so its own impact bars cannot be restyled; a legend under the filters maps the bars to the
folders (TradingView has no gray "non-economic" level). Cris
wanted this at no cost, so there is no API, key or Blaze plan behind it; keep TradingView's
credit link under the widget. Paid APIs (Financial Modeling Prep, Trading Economics) were
weighed and left for later; their data needs an extra display license to show to students.

The chart is TradingView's [lightweight-charts](https://github.com/tradingview/lightweight-charts)
(Apache-2.0; its logo on the chart is the required attribution). P/L figures are computed in the
student's browser, so treat them as practice data, not as graded results. This also holds for
evaluations and the ranking: a determined student could write a made-up P/L from the browser's
developer tools, or look up the replay's dates; grading that cannot be gamed needs the replay
and P/L to run on a server (Cloud Functions, which need the Blaze plan).

## Scripts

| Command                | What it does                                                |
| ---------------------- | ----------------------------------------------------------- |
| `npm start`            | dev server (`ng serve`) at http://localhost:4200            |
| `npm run emulators`    | Auth + Firestore emulators with the Emulator UI             |
| `npm run build`        | production build to `dist/indab-web-app/browser`            |
| `npm run watch`        | development build in watch mode                             |
| `npm test`             | unit tests (Vitest), watch mode                             |
| `npm run test:ci`      | unit tests once, with coverage                              |
| `npm run test:rules`   | Firestore security rules tests against the emulator         |
| `npm run test:e2e`     | end-to-end browser tests (Playwright) against the emulators |
| `npm run test:all`     | all test suites                                             |
| `npm run deploy:rules` | deploy Firestore rules and indexes                          |
| `npm run deploy`       | build and deploy to Firebase Hosting                        |

## Project structure

```
src/app/
  core/firebase/   Firebase app, Auth and Firestore providers (DI tokens)
  core/auth/       AuthService (signals) and route guards
  core/models/     Firestore document types
  core/i18n/       translations (es, en, pt), I18n service, title strategy, localDate pipe
  core/loading/    LoadingService: what the page loader waits for
  features/        landing, auth, academy, repository, eleva, admin
  shared/layout/   header
  shared/language/ language switcher (flag menu) and flags
  shared/loader/   page loader (the logo bouncing), shown on start, navigation and data loads
public/            logo, favicons and app icons (made from the logo's mark), manifest
src/environments/  environment.ts (indab-academy) and environment.development.ts (emulators)
firestore.rules    security rules (tested in tests/firestore.rules.test.ts)
e2e/               Playwright end-to-end tests and emulator seeding helpers
CLAUDE.md          conventions for Claude Code; the project skill lives in .claude/skills/indab-dev
```

## Troubleshooting

- **`npm install` warns `EBADENGINE` or `ng` says the Node.js version is unsupported**: upgrade to
  Node 24.15+ (see Requirements), delete `node_modules` and run `npm install` again.
- **Emulators fail with "Could not spawn `java -version`"**: install Java 21+ and reopen the terminal.
- **Port 8080 / 9099 / 4000 already in use**: stop the other process or change the ports in `firebase.json`
  (and the emulator hosts in `src/app/core/firebase/firebase.providers.ts`).
- **Sign-in works but `/academy/material` redirects to `/academy`**: the user has no `enrollments/{uid}` with
  `academy: true` (or is not an admin).
- **PowerShell blocks `npm`/`npx` scripts**: run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
