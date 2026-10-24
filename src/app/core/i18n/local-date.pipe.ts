import { formatDate, registerLocaleData } from '@angular/common';
import localeEs419 from '@angular/common/locales/es-419';
import localePt from '@angular/common/locales/pt';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18n } from './i18n.service';

// en-US ships with Angular; the other two languages need their month names.
registerLocaleData(localeEs419, 'es-419');
registerLocaleData(localePt, 'pt-BR');

/**
 * `DatePipe` in the site's current language: "23 oct 2026", "Oct 23, 2026"... Impure, so dates
 * follow a language switch. Numbers keep the en-US format traders use everywhere (1,250.00).
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly i18n = inject(I18n);

  transform(
    value: Date | number | string | null | undefined,
    format = 'mediumDate',
    timezone?: string,
  ): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return formatDate(value, format, this.i18n.language(), timezone);
  }
}
