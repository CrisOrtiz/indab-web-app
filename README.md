# INDAB web app

Web app for **INDAB Academy** and **Eleva Inversiones**.

- **INDAB Academy** teaches trading. The app has a public landing page, accounts (email/password
  and Google), an academy area for students and a repository of learning material that only
  enrolled students can open.
- **Eleva Inversiones** is INDAB's investment arm. It pools investor money, trades with it and
  pays investors a monthly return. The app has a public Eleva page and investor accounts
  (`investors/{uid}`) that only the investor and INDAB admins can read.

Built with Angular 22 (standalone components, signals, SCSS) and Firebase Authentication and
Cloud Firestore through the modular Firebase JS SDK (no AngularFire). The UI is in Spanish.

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | `^24.15.0` (recommended), `^22.22.3` or `>=26` | Angular 22 CLI refuses older versions (e.g. Node 22.13 fails with an `EBADENGINE` / "unsupported Node.js version" error) |
| npm | 11 (ships with Node 24) | |
| Java | 21+ | Firebase emulators (Auth + Firestore) |
| Git | any recent | |

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

| Suite | Where | What it covers |
| --- | --- | --- |
| Unit | `src/**/*.spec.ts` | `AuthService`, guards, routes, login/register forms, admin page and service, header. Firebase is faked with `vi.mock`, no emulator needed. |
| Rules | `tests/firestore.rules.test.ts` | every collection in `firestore.rules`, allowed and denied, for visitor, student, enrolled, owner and admin |
| End-to-end | `e2e/*.spec.ts` | the real app in Chromium against the Auth + Firestore emulators: register, login, guards, sign-out, admin grants access and promotes users, a practice replay is logged, reviewed and deleted (market data mocked) |

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
`indab-academy.firebaseapp.com`). `firebase.json` serves `dist/indab-web-app/browser`, rewrites every
route to `index.html` (so deep links like `/academy` work) and caches hashed JS/CSS for a year
while `index.html` is always revalidated. Manual deploy from your machine:

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
The service account needs the *Firebase Admin* and *Service Usage Consumer* roles for `firebase deploy`.

## Access model

| Collection | Who can read | Who can write |
| --- | --- | --- |
| `users/{uid}` | owner, admins | owner creates as `student` and edits `displayName`; admins change `role` (not their own) |
| `enrollments/{uid}` `{academy, courses[], updatedAt, updatedBy}` | owner, admins | admins |
| `courses/{id}` | everyone if `published`, admins | admins |
| `courses/{id}/lessons/{id}` | users enrolled in that course or with academy access | admins |
| `materials/{id}` | users with academy access (`enrollments/{uid}.academy == true`), admins | admins |
| `investors/{uid}` (Eleva) | owner, admins | admins |
| `practiceSessions/{id}` (chart replay) | owner, admins | owner with academy access creates it and updates its summary until `finished`; admins delete |
| `practiceSessions/{id}/trades/{id}` | session owner, admins | session owner opens trades while the session is active and closes each once (entry never editable); admins delete |

A user gets access to the academy and the material repository when an admin turns on
"Acceso a la academia" for them in `/admin` (which writes `enrollments/{uid}` with
`academy: true`). Admins also promote or demote other users there. The first admin has to be
set by hand: in the Firebase console, open `users/{uid}` for that account and change `role` to
`admin`. Admins cannot remove their own admin role, so there is always at least one. The route guards mirror these checks in the UI, but
the rules are what actually protect the data. Anything not listed is denied.

## Routes

| Path | Access |
| --- | --- |
| `/` landing, `/eleva` | public |
| `/login`, `/register` | signed-out visitors |
| `/academy` | signed-in users (shows "pending" until enrolled) |
| `/academy/material` | enrolled users (learning material, opened from the academy; `/repository` redirects here) |
| `/academy/practice` | enrolled users (chart-replay trading practice) |
| `/admin` | admins (users, roles, academy access) |
| `/admin/practice` | admins (review students' practice sessions on the chart, delete them) |

## Trading practice (chart replay)

`/academy/practice` replays real historical candles bar by bar. For now the only market is
gold, through Binance's PAXG/USDT (a token that tracks XAU/USD), on 15m/1h/4h/1d. Candles come
from Binance's public market-data API (`data-api.binance.vision`, falling back to
`api.binance.com`): free, no API key, fetched by each student's browser. USD/JPY and NASDAQ
are planned but need a data source licensed for showing prices to students (Dukascopy's free
feed is for personal use only, and free APIs don't allow display to third parties).

Each session starts at a random moment or on a date the student picks (on a 4-hour boundary, at
least 30 days before today), with the dates optionally hidden. The replay runs on one-minute candles, fetched 1000 at a time
as it goes, and the chart builds them into bars of the timeframe the student picks: 1m, 3m, 5m,
15m (the default), 1h or 4h, switchable at any time; each timeframe shows its 500 bars of
history before the start. Every bar is the open of its first minute, the highest high, lowest
low and close of its last, so the timeframes agree (a 3m bar is three 1m bars, a 1h bar four 15m
bars, the bar in the making included); a test in `practice.spec.ts` checks this across all six.
"Siguiente vela" shows the next bar of that timeframe, and orders, stops and the stop out are
checked minute by minute.

Students start with 200 virtual USD and trade in lots (1 lot = 100 oz) with 1:100 leverage: a
position ties up 1% of its value as margin, and every position is closed (stop out) when equity
falls below 50% of the margin in use. Orders are market, limit or stop, with optional stop loss
and take profit. The screen follows TradingView: one-click Buy/Sell over the chart, an order
panel with Market/Limit/Stop tabs, lots with their margin, and take profit / stop loss switches
that show their P/L and the reward to risk, plus an account summary and Positions / Orders /
History tabs under the chart. Every order, position, stop loss and take profit is a line on the
chart with a label showing its size and P/L and a × to close, cancel or remove it; order prices
and stops can be dragged by the line or the label. As in TradingView, the order being set up is a
line with a Buy/Sell button that places it, dragging up or down from it (or from an open
position) pulls out a take profit or stop loss, and a "+" next to the price scale offers a buy or
sell limit/stop at the price under the pointer, filling in the order panel, or a horizontal line. The chart toolbar adds MA 20, MA 50, EMA 21
and RSI 14 (in its own pane, computed only from the bars shown) and drawings: horizontal and trend
lines, rectangles and Fibonacci retracements. A Statistics tab, the end screen and the admin
review show the session's win rate, profit factor, average win and loss, maximum drawdown and
equity curve.

Sessions and orders are written to Firestore as they happen; admins review them at
`/admin/practice`, where each session's trades are drawn on its candles (fetched again from
Binance) and a session can be deleted with its trades.

The chart is TradingView's [lightweight-charts](https://github.com/tradingview/lightweight-charts)
(Apache-2.0; its logo on the chart is the required attribution). P/L figures are computed in the
student's browser, so treat them as practice data, not as graded results.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | dev server (`ng serve`) at http://localhost:4200 |
| `npm run emulators` | Auth + Firestore emulators with the Emulator UI |
| `npm run build` | production build to `dist/indab-web-app/browser` |
| `npm run watch` | development build in watch mode |
| `npm test` | unit tests (Vitest), watch mode |
| `npm run test:ci` | unit tests once, with coverage |
| `npm run test:rules` | Firestore security rules tests against the emulator |
| `npm run test:e2e` | end-to-end browser tests (Playwright) against the emulators |
| `npm run test:all` | all test suites |
| `npm run deploy:rules` | deploy Firestore rules and indexes |
| `npm run deploy` | build and deploy to Firebase Hosting |

## Project structure

```
src/app/
  core/firebase/   Firebase app, Auth and Firestore providers (DI tokens)
  core/auth/       AuthService (signals) and route guards
  core/models/     Firestore document types
  features/        landing, auth, academy, repository, eleva, admin
  shared/layout/   header
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
