# INDAB web app

Web app for **INDAB Academy** (trading education) and **Eleva Inversiones**.
Angular 22 (standalone components, signals, SCSS) with Firebase Authentication and Cloud Firestore
via the modular Firebase JS SDK.

## Requirements

- Node.js `^22.22.3`, `^24.15.0` or `>=26` (required by Angular 22)
- Java 21+ for the Firebase emulators

## Getting started

```bash
npm install
npm run emulators   # Auth + Firestore emulators, UI at http://127.0.0.1:4000
npm start           # http://localhost:4200, talks to the emulators by default
```

The development environment (`src/environments/environment.development.ts`) points at the
emulators with the offline project `demo-indab`, so no real Firebase project is needed to develop.

## Connecting the real Firebase project

1. In the [Firebase console](https://console.firebase.google.com), create the project and add a **Web app**.
2. Copy its config object into `src/environments/environment.ts` (and into
   `environment.development.ts` with `useEmulators: false` if you want `ng serve` to use it).
   These values are public identifiers; access is enforced by the security rules.
3. **Authentication > Sign-in method**: enable *Email/Password* and *Google*.
4. **Firestore Database**: create the database, then set the project id in `.firebaserc`
   and deploy the rules with `npm run deploy:rules`.
5. Promote the first admin: in Firestore, edit `users/{uid}` of your account and set `role` to `admin`.

## Access model

| Collection | Who can read | Who can write |
| --- | --- | --- |
| `users/{uid}` | owner, admins | owner creates as `student` and edits `displayName`; admins everything |
| `enrollments/{uid}` | owner, admins | admins |
| `courses/{id}` | everyone if `published`, admins | admins |
| `courses/{id}/lessons/{id}` | users enrolled in that course or with academy access | admins |
| `materials/{id}` | users with academy access (`enrollments/{uid}.academy == true`), admins | admins |
| `investors/{uid}` (Eleva) | owner, admins | admins |

A user gets access to the academy and the material repository when an admin creates
`enrollments/{uid}` with `academy: true`. The route guards mirror these checks in the UI.

## Routes

| Path | Access |
| --- | --- |
| `/` landing, `/eleva` | public |
| `/login`, `/register` | signed-out visitors |
| `/academy` | signed-in users (shows "pending" until enrolled) |
| `/repository` | enrolled users |

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | dev server |
| `npm run build` | production build to `dist/indab-web-app/browser` |
| `npm test` | unit tests (Vitest) |
| `npm run test:rules` | Firestore security rules tests against the emulator |
| `npm run deploy:rules` | deploy Firestore rules and indexes |
| `npm run deploy` | build and deploy to Firebase Hosting |

## Project structure

```
src/app/
  core/firebase/   Firebase app, Auth and Firestore providers
  core/auth/       AuthService (signals) and route guards
  core/models/     Firestore document types
  features/        landing, auth, academy, repository, eleva (placeholders to build out)
  shared/layout/   header
firestore.rules    security rules (tested in tests/firestore.rules.test.ts)
```
