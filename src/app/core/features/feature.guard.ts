import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { FeatureKey } from '../models/feature-flags';
import { FeatureFlags } from './feature-flags.service';

/**
 * Lets the page open only while `key` is shown to this user (see `/admin/features`); otherwise
 * sends them to the academy home. Goes after the access guard (`enrolledGuard`, ...), which
 * deals with visitors.
 */
export function featureGuard(key: FeatureKey): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const flags = inject(FeatureFlags);
    const router = inject(Router);
    await auth.whenReady();
    if (!auth.isLoggedIn()) {
      return true;
    }
    await flags.whenReady();
    return flags.shown(key) || router.createUrlTree(['/academy']);
  };
}

/** Not a check: loads the flags before a page that hides parts by them (academy home, profile). */
export const featureFlagsReady: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const flags = inject(FeatureFlags);
  await auth.whenReady();
  if (auth.isLoggedIn()) {
    await flags.whenReady();
  }
  return true;
};
