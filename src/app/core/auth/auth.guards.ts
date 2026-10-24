import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Allows signed-in users; sends everyone else to the login page. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return (
    auth.isLoggedIn() || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })
  );
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
  return auth.hasAcademyAccess() || router.createUrlTree(['/academy']);
};

/** Allows trainers and admins. Firestore rules enforce the same check on the data. */
export const staffGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return auth.isStaff() || router.createUrlTree(['/academy']);
};

/** Allows admins only. Firestore rules enforce the same check on the data. */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return auth.isAdmin() || router.createUrlTree(['/academy']);
};
