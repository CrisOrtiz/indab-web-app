import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { FIRESTORE_LOADER } from '../firebase/firebase.providers';
import { AuthService } from './auth.service';

/**
 * Where a signed-in user goes before any page: `/account-setup` while their email is
 * unconfirmed or their details are missing (see `AuthService.setupStep`), then back here.
 */
function pendingSetup(auth: AuthService, router: Router, url: string): UrlTree | null {
  return auth.setupStep()
    ? router.createUrlTree(['/account-setup'], { queryParams: { returnUrl: url } })
    : null;
}

/** Allows signed-in users; sends everyone else to the login page. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return pendingSetup(auth, router, state.url) ?? true;
};

/** The account setup page: only for signed-in users with a step left. */
export const setupGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return auth.setupStep() !== null || router.createUrlTree(['/academy']);
};

/** Keeps signed-in users away from the login and register pages. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return !auth.isLoggedIn() || router.createUrlTree(['/academy']);
};

/** Allows enrolled users (and admins). Firestore rules enforce the same check on the data. */
export const enrolledGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return (
    pendingSetup(auth, router, state.url) ??
    (auth.hasAcademyAccess() || router.createUrlTree(['/academy']))
  );
};

/** Allows trainers and admins. Firestore rules enforce the same check on the data. */
export const staffGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return (
    pendingSetup(auth, router, state.url) ?? (auth.isStaff() || router.createUrlTree(['/academy']))
  );
};

/** Allows admins only. Firestore rules enforce the same check on the data. */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return (
    pendingSetup(auth, router, state.url) ?? (auth.isAdmin() || router.createUrlTree(['/academy']))
  );
};

/**
 * Not a check: starts downloading the Firestore SDK while the visitor fills in the login or
 * register form, so the academy opens quickly after signing in.
 */
export const preloadFirestore: CanActivateFn = () => {
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    inject(FIRESTORE_LOADER)
      .load()
      .catch(() => undefined);
  }
  return true;
};
