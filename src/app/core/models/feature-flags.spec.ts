import { featureShown, readFlags } from './feature-flags';

describe('feature flags', () => {
  it('reads only known features and modes', () => {
    expect(readFlags(undefined)).toEqual({});
    expect(readFlags({ flags: 'off' })).toEqual({});
    expect(
      readFlags({ flags: { practice: 'off', ranking: 'staff', exams: 'gone', eleva: 'off' } }),
    ).toEqual({ practice: 'off', ranking: 'staff' });
  });

  it('shows a feature to everyone, staff only or nobody', () => {
    expect(featureShown(undefined, false)).toBe(true);
    expect(featureShown('on', false)).toBe(true);
    expect(featureShown('staff', false)).toBe(false);
    expect(featureShown('staff', true)).toBe(true);
    expect(featureShown('off', true)).toBe(false);
  });
});
