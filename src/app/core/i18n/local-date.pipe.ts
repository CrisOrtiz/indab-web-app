import { formatDate, registerLocaleData } from '@angular/common';
import localeEs419 from '@angular/common/locales/es-419';
import localePt from '@angular/common/locales/pt';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { TimeZoneService } from '../time-zone/time-zone.service';
import { I18n } from './i18n.service';

// en-US ships with Angular; the other two languages need their month names.
registerLocaleData(localeEs419, 'es-419');
registerLocaleData(localePt, 'pt-BR');

/**
 * `DatePipe` in the site's current language: "23 oct 2026", "Oct 23, 2026"... Impure, so dates
 * follow a language switch. Numbers keep the en-US format traders use everywhere (1,250.00).
 * Times are in the user's chosen time zone (La Paz by default) unless `timezone` is given.
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  private readonly zones = inject(TimeZoneService);

  transform(
    value: Date | number | string | null | undefined,
    format = 'mediumDate',
    timezone?: string,
  ): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(time)) {
      return null;
    }
    return formatDate(value, format, this.i18n.language(), timezone ?? this.zones.offset(time));
  }
}
