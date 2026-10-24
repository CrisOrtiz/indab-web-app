import { TestBed } from '@angular/core/testing';
import { I18n } from './i18n.service';
import { LocalDatePipe } from './local-date.pipe';

describe('LocalDatePipe', () => {
  const date = Date.UTC(2021, 4, 10, 15, 30);

  it('formats dates in the current language', async () => {
    const pipe = TestBed.runInInjectionContext(() => new LocalDatePipe());
    const i18n = TestBed.inject(I18n);
    expect(pipe.transform(date, 'd MMM y', 'UTC')).toBe('10 may 2021');
    await i18n.use('en-US');
    expect(pipe.transform(date, 'MMMM d', 'UTC')).toBe('May 10');
    await i18n.use('pt-BR');
    expect(pipe.transform(date, 'd MMMM', 'UTC')).toBe('10 maio');
  });

  it('shows nothing for a missing date', () => {
    const pipe = TestBed.runInInjectionContext(() => new LocalDatePipe());
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeNull();
  });
});
