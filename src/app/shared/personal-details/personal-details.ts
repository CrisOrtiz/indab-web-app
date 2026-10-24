// The birth date (required) and WhatsApp number (optional) asked at registration, on the account
// setup page and in the profile. Each form shows the two fields itself, so its own styles apply.

import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { PersonalDetails } from '../../core/models/user-profile';

/** The earliest birth date accepted (the rules accept years 1900-2099). */
export const MIN_BIRTH_DATE = '1900-01-01';

/** Today as `YYYY-MM-DD` in the user's time zone, the format of `<input type="date">`. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `+52 (55) 1234-5678` → `+525512345678`: what is stored in `users/{uid}.whatsapp`. */
export function normalizeWhatsapp(value: string): string {
  return value.replace(/[\s().-]/g, '');
}

/** A real date between 1900 and today. */
export function birthDateValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value;
  if (!value) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    value >= MIN_BIRTH_DATE &&
    value <= today();
  return valid ? null : { birthDate: true };
}

/** Empty, or `+` with the country code and 8 to 15 digits in all. */
export function whatsappValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = normalizeWhatsapp(control.value ?? '');
  return !value || /^\+\d{8,15}$/.test(value) ? null : { whatsapp: true };
}

export type DetailsForm = FormGroup<{
  birthDate: FormControl<string>;
  whatsapp: FormControl<string>;
}>;

/** The birth date (required) and WhatsApp (optional) controls, filled from `initial`. */
export function detailsForm(initial: Partial<PersonalDetails> = {}): DetailsForm {
  return new FormGroup({
    birthDate: new FormControl(initial.birthDate ?? '', {
      nonNullable: true,
      validators: [Validators.required, birthDateValidator],
    }),
    whatsapp: new FormControl(initial.whatsapp ?? '', {
      nonNullable: true,
      validators: [whatsappValidator],
    }),
  });
}

/** The form's values as stored: WhatsApp without spaces or dashes. */
export function detailsValue(form: DetailsForm): PersonalDetails {
  const { birthDate, whatsapp } = form.getRawValue();
  return { birthDate, whatsapp: normalizeWhatsapp(whatsapp) };
}
