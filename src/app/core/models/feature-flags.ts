import type { Timestamp } from 'firebase/firestore';

/**
 * Features admins can show or hide at `/admin/features`. Each one is a section of the signed-in
 * app; adding a key here (and its texts in `featureFlags.items` of the three message files) makes
 * it appear on that page. The rules accept any key, so no rules change is needed.
 */
export const FEATURE_KEYS = [
  'material',
  'practice',
  'exams',
  'ranking',
  'calendar',
  'reviews',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * Who sees a feature: everyone who could open it (`on`, the default), only trainers and admins
 * (`staff`, to try something before students do) or nobody (`off`).
 */
export const FEATURE_MODES = ['on', 'staff', 'off'] as const;
export type FeatureMode = (typeof FEATURE_MODES)[number];

/** Stored at `config/features`; a feature missing from `flags` is `on`. Admins write it. */
export interface FeatureFlagsDoc {
  flags: Partial<Record<FeatureKey, FeatureMode>>;
  updatedAt: Timestamp;
  updatedBy: string;
}

/** Keeps only known modes, so a bad value never hides a feature by accident. */
export function readFlags(data: unknown): Partial<Record<FeatureKey, FeatureMode>> {
  const flags = (data as { flags?: unknown } | null | undefined)?.flags;
  if (!flags || typeof flags !== 'object') {
    return {};
  }
  const result: Partial<Record<FeatureKey, FeatureMode>> = {};
  for (const key of FEATURE_KEYS) {
    const mode = (flags as Record<string, unknown>)[key];
    if ((FEATURE_MODES as readonly unknown[]).includes(mode)) {
      result[key] = mode as FeatureMode;
    }
  }
  return result;
}

/** Whether a feature in `mode` shows for a user (`staff` = trainer or admin). */
export function featureShown(mode: FeatureMode | undefined, staff: boolean): boolean {
  return mode === 'off' ? false : mode === 'staff' ? staff : true;
}
