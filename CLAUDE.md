# INDAB web app

Angular 22 + Firebase (Auth, Firestore) app for INDAB Academy (trading school) and Eleva
Inversiones (INDAB's investment arm). See `README.md` for setup and the access model.

Before changing code, load the project skill `.claude/skills/indab-dev/SKILL.md`. It holds the
conventions, the access model and the checklist for adding a module.

Essentials:

- Plain Firebase JS SDK through the DI tokens in `src/app/core/firebase/firebase.providers.ts`.
  Do not add AngularFire.
- Standalone components, signals, `inject()`, new control flow (`@if`, `@for`), lazy routes.
- UI copy is in Spanish; code, comments and commits are in English.
- Every Firestore collection needs rules in `firestore.rules` and tests in
  `tests/firestore.rules.test.ts`; route guards only mirror the rules.
- Node `^24.15.0` (or `^22.22.3`) is required by Angular 22. Check with `npm test`,
  `npm run test:rules` (needs Java) and `npm run build`.
- Never commit service account keys or `.env` files.
