import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import {
  MIN_BIRTH_DATE,
  detailsForm,
  detailsValue,
  today,
} from '../../shared/personal-details/personal-details';
import { authErrorMessage } from '../auth/auth-errors';
import { ProfileService } from '../profile/profile.service';

type Status = { kind: 'error' | 'notice'; text: string };

/**
 * `/account-setup`: where the guards send a signed-in user whose account is not ready (see
 * `AuthService.setupStep`). First they confirm their email, then they give their birth date
 * (and optionally WhatsApp); then they go on to the page they asked for.
 */
@Component({
  selector: 'app-account-setup',
  imports: [ReactiveFormsModule],
  templateUrl: './account-setup.html',
  styleUrl: '../auth/auth-form.scss',
  host: { '(window:focus)': 'checkOnReturn()' },
})
export class AccountSetup {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  private readonly profiles = inject(ProfileService);
  private readonly router = inject(Router);

  /** Bound from `?returnUrl=`, set by the guards. */
  readonly returnUrl = input<string>('/academy');

  protected readonly step = this.auth.setupStep;
  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  protected readonly busy = signal(false);
  protected readonly status = signal<Status | null>(null);

  protected readonly form = detailsForm();
  protected readonly minBirthDate = MIN_BIRTH_DATE;
  protected readonly maxBirthDate = today();

  constructor() {
    // Each step clears its own messages; once nothing is left, go on.
    let previous = this.step();
    effect(() => {
      const step = this.step();
      if (step !== previous) {
        previous = step;
        this.status.set(null);
      }
      if (step === null && this.auth.isLoggedIn()) {
        this.router.navigateByUrl(this.safeReturnUrl());
      }
    });
  }

  protected async checkVerified(): Promise<void> {
    await this.run(async () => {
      if (!(await this.auth.checkEmailVerified())) {
        this.status.set({ kind: 'error', text: this.i18n.messages().setup.notVerified });
      }
    });
  }

  protected resend(): Promise<void> {
    return this.run(async () => {
      await this.auth.sendVerificationEmail();
      this.status.set({ kind: 'notice', text: this.i18n.messages().setup.resent });
    });
  }

  /** Coming back from the email tab: check quietly whether the link was opened. */
  protected checkOnReturn(): void {
    if (this.step() === 'verifyEmail' && !this.busy()) {
      this.auth.checkEmailVerified().catch(() => undefined);
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.run(() => this.profiles.saveDetails(detailsValue(this.form)));
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/');
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.status.set(null);
    try {
      await action();
    } catch (e) {
      this.status.set({
        kind: 'error',
        text: authErrorMessage(e, this.i18n.messages().auth.errors),
      });
    } finally {
      this.busy.set(false);
    }
  }

  /** Only follow in-app paths, never an external URL. */
  private safeReturnUrl(): string {
    const url = this.returnUrl() || '/academy';
    return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/account-setup')
      ? url
      : '/academy';
  }
}
