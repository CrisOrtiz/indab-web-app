import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18n } from '../../../core/i18n/i18n.service';
import {
  MIN_BIRTH_DATE,
  detailsForm,
  detailsValue,
  today,
} from '../../../shared/personal-details/personal-details';
import { authErrorMessage } from '../auth-errors';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: '../auth-form.scss',
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    details: detailsForm(),
  });
  protected readonly details = this.form.controls.details;
  protected readonly minBirthDate = MIN_BIRTH_DATE;
  protected readonly maxBirthDate = today();
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { displayName, email, password } = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.registerWithEmail(
        displayName.trim(),
        email,
        password,
        detailsValue(this.details),
      );
      // The guards hold the academy until the email is confirmed.
      await this.router.navigateByUrl('/account-setup');
    } catch (e) {
      this.error.set(authErrorMessage(e, this.i18n.messages().auth.errors));
    } finally {
      this.loading.set(false);
    }
  }
}
