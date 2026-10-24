import { FormControl } from '@angular/forms';
import {
  birthDateValidator,
  detailsForm,
  detailsValue,
  normalizeWhatsapp,
  today,
  whatsappValidator,
} from './personal-details';

describe('personal details', () => {
  const errors = (validator: typeof birthDateValidator, value: string) =>
    validator(new FormControl(value, { nonNullable: true }));

  it('formats today in local time as the date input does', () => {
    expect(today(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('accepts real birth dates between 1900 and today', () => {
    expect(errors(birthDateValidator, '')).toBeNull();
    expect(errors(birthDateValidator, '1990-02-28')).toBeNull();
    expect(errors(birthDateValidator, today())).toBeNull();
    expect(errors(birthDateValidator, '1899-12-31')).toEqual({ birthDate: true });
    expect(errors(birthDateValidator, '2999-01-01')).toEqual({ birthDate: true });
    expect(errors(birthDateValidator, '1990-13-45')).toEqual({ birthDate: true });
    expect(errors(birthDateValidator, '15/04/1990')).toEqual({ birthDate: true });
  });

  it('accepts WhatsApp numbers with a country code, written any common way', () => {
    expect(normalizeWhatsapp('+52 (55) 1234-5678')).toBe('+525512345678');
    expect(errors(whatsappValidator, '')).toBeNull();
    expect(errors(whatsappValidator, '+52 55 1234 5678')).toBeNull();
    expect(errors(whatsappValidator, '+1.305.123.4567')).toBeNull();
    expect(errors(whatsappValidator, '55 1234 5678')).toEqual({ whatsapp: true });
    expect(errors(whatsappValidator, '+52 55')).toEqual({ whatsapp: true });
    expect(errors(whatsappValidator, '+52 55 abc')).toEqual({ whatsapp: true });
  });

  it('builds the form and returns its stored values', () => {
    const form = detailsForm({ birthDate: '1990-01-01' });
    expect(form.valid).toBe(true);
    form.controls.whatsapp.setValue('+56 9 1234 5678');
    expect(detailsValue(form)).toEqual({ birthDate: '1990-01-01', whatsapp: '+56912345678' });
    form.controls.birthDate.setValue('');
    expect(form.controls.birthDate.hasError('required')).toBe(true);
  });
});
