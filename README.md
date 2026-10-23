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
3. The app reacts immediately; `/repository` opens.

## Tests

```bash
npm test             # unit tests (Vitest through the Angular CLI)
npm run test:rules   # Firestore security rules tests; starts the Firestore emulator itself (needs Java)
```

Every change to `firestore.rules` should come with a test in `tests/firestore.rules.test.ts`.

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

1. **Build and test**: `npm run build`, `npm test` and `npm run test:rules` (Node 24, Java 21 for
   the Firestore emulator). Nothing deploys unless this job passes.
2. **Deploy preview** (pull requests): a 7-day preview URL posted as a PR comment.
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
| `/repository` | enrolled users |
| `/admin` | admins (users, roles, academy access) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | dev server (`ng serve`) at http://localhost:4200 |
| `npm run emulators` | Auth + Firestore emulators with the Emulator UI |
| `npm run build` | production build to `dist/indab-web-app/browser` |
| `npm run watch` | development build in watch mode |
| `npm test` | unit tests (Vitest) |
| `npm run test:rules` | Firestore security rules tests against the emulator |
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
CLAUDE.md          conventions for Claude Code; the project skill lives in .claude/skills/indab-dev
```

## Troubleshooting

- **`npm install` warns `EBADENGINE` or `ng` says the Node.js version is unsupported**: upgrade to
  Node 24.15+ (see Requirements), delete `node_modules` and run `npm install` again.
- **Emulators fail with "Could not spawn `java -version`"**: install Java 21+ and reopen the terminal.
- **Port 8080 / 9099 / 4000 already in use**: stop the other process or change the ports in `firebase.json`
  (and the emulator hosts in `src/app/core/firebase/firebase.providers.ts`).
- **Sign-in works but `/repository` redirects to `/academy`**: the user has no `enrollments/{uid}` with
  `academy: true` (or is not an admin).
- **PowerShell blocks `npm`/`npx` scripts**: run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
