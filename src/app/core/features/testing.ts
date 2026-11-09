import { signal } from '@angular/core';
import { FeatureKey, FeatureMode, featureShown } from '../models/feature-flags';
import { FeatureFlags } from './feature-flags.service';

/**
 * A `FeatureFlags` for component specs: no Firestore, every feature on unless `flags` says
 * otherwise (`staff` counts as hidden unless `staff` is true). Change `flags` to update the page.
 */
export function quietFeatureFlags(
  initial: Partial<Record<FeatureKey, FeatureMode>> = {},
  staff = false,
) {
  const flags = signal(initial);
  const service = {
    flags,
    whenReady: async () => undefined,
    shown: (key: FeatureKey) => featureShown(flags()[key], staff),
    setMode: async (key: FeatureKey, mode: FeatureMode) =>
      flags.update((current) => ({ ...current, [key]: mode })),
  };
  return {
    flags,
    service,
    providers: [{ provide: FeatureFlags, useValue: service }],
  };
}
