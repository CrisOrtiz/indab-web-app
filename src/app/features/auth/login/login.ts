import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18n } from '../../../core/i18n/i18n.service';
import { authErrorMessage } from '../auth-errors';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: '../auth-form.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);

  /** Bound from the `?returnUrl=` query param set by the guards. */
  readonly returnUrl = input<string>('/academy');
  /** `?ended=1`: the user signed this browser out from another device. */
  readonly ended = input<string>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    await this.run(() => this.auth.signInWithEmail(email, password));
  }

  protected signInWithGoogle(): Promise<void> {
    return this.run(() => this.auth.signInWithGoogle());
  }

  protected async resetPassword(): Promise<void> {
    const email = this.form.controls.email;
    if (email.invalid) {
      email.markAsTouched();
      this.error.set(this.i18n.messages().auth.login.resetNeedsEmail);
      return;
    }
    this.error.set(null);
    try {
      await this.auth.sendPasswordReset(email.value);
      this.notice.set(this.i18n.messages().auth.login.resetSent);
    } catch (e) {
      this.error.set(authErrorMessage(e, this.i18n.messages().auth.errors));
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
      await this.router.navigateByUrl(this.safeReturnUrl());
    } catch (e) {
      this.error.set(authErrorMessage(e, this.i18n.messages().auth.errors));
    } finally {
      this.loading.set(false);
    }
  }

  /** Only follow in-app paths, never an external URL. */
  private safeReturnUrl(): string {
    const url = this.returnUrl() || '/academy';
    return url.startsWith('/') && !url.startsWith('//') ? url : '/academy';
  }
}
