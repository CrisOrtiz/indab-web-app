import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n, LANGUAGES, Language } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { PracticeSession } from '../../core/models/practice';
import { Avatar } from '../../shared/avatar/avatar';
import { PhotoError } from '../../shared/avatar/resize-image';
import { authErrorMessage } from '../auth/auth-errors';
import { signedMoney } from '../practice/practice-format';
import { PracticeService } from '../practice/practice.service';
import { summarizePractice } from './practice-summary';
import { ProfileService, signInMethods } from './profile.service';

/** How many of the latest practice sessions the summary covers. */
export const PRACTICE_SESSIONS = 50;

/** How many sessions the "latest" list shows. */
const RECENT_SESSIONS = 5;

type Section = 'photo' | 'name' | 'password';
type Status = { kind: 'error' | 'notice'; text: string };

/** `/profile`: the signed-in user's photo, name, password, language and practice results. */
@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, RouterLink, Avatar, LocalDatePipe],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  private readonly profiles = inject(ProfileService);
  private readonly practice = inject(PracticeService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly languages = LANGUAGES;
  protected readonly signed = signedMoney;

  protected readonly name = computed(
    () =>
      this.auth.profile()?.displayName ||
      this.auth.user()?.displayName ||
      this.auth.user()?.email ||
      '',
  );
  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  /** The uploaded photo wins over the Google one. */
  protected readonly photo = computed(
    () => this.auth.profile()?.photoURL || this.auth.user()?.photoURL || null,
  );
  protected readonly hasUploadedPhoto = computed(() => !!this.auth.profile()?.photoURL);
  protected readonly hasGooglePhoto = computed(() => !!this.auth.user()?.photoURL);
  protected readonly methods = computed(() => signInMethods(this.auth.user()));
  protected readonly hasPassword = computed(() => this.methods().includes('password'));
  protected readonly memberSince = computed(() => {
    const created = this.auth.profile()?.createdAt;
    const fallback = this.auth.user()?.metadata?.creationTime;
    return created?.toDate?.() ?? (fallback ? new Date(fallback) : null);
  });
  protected readonly access = computed(() =>
    this.auth.isAdmin() ? 'admin' : this.auth.hasAcademyAccess() ? 'enabled' : 'pending',
  );

  protected readonly busy = signal<Section | null>(null);
  protected readonly status = signal<Partial<Record<Section, Status>>>({});

  protected readonly nameForm = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
  });
  protected readonly passwordForm = this.fb.group({
    current: [''],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirm: [''],
  });

  /** Latest practice sessions; null while loading. */
  protected readonly sessions = signal<PracticeSession[] | null>(null);
  protected readonly practiceFailed = signal(false);
  protected readonly summary = computed(() => summarizePractice(this.sessions() ?? []));
  protected readonly recent = computed(() => (this.sessions() ?? []).slice(0, RECENT_SESSIONS));
  protected readonly maxSessions = PRACTICE_SESSIONS;

  constructor() {
    // Fill the name once the profile loads, without overwriting what the user is typing.
    effect(() => {
      const name = this.auth.profile()?.displayName ?? this.auth.user()?.displayName ?? '';
      untracked(() => {
        if (!this.nameForm.dirty) {
          this.nameForm.setValue({ displayName: name });
        }
      });
    });
    this.loadPractice();
  }

  protected async changePhoto(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    await this.run('photo', this.i18n.messages().profile.photoSaved, () =>
      this.profiles.uploadPhoto(file),
    );
  }

  protected removePhoto(): Promise<void> {
    return this.run('photo', this.i18n.messages().profile.photoRemoved, () =>
      this.profiles.removePhoto(),
    );
  }

  protected async saveName(): Promise<void> {
    const control = this.nameForm.controls.displayName;
    control.setValue(control.value.trim());
    if (this.nameForm.invalid) {
      this.nameForm.markAllAsTouched();
      return;
    }
    await this.run('name', this.i18n.messages().profile.nameSaved, async () => {
      await this.profiles.updateDisplayName(control.value);
      this.nameForm.markAsPristine();
    });
  }

  protected async savePassword(): Promise<void> {
    const t = this.i18n.messages().profile;
    const { current, password, confirm } = this.passwordForm.getRawValue();
    this.passwordForm.markAllAsTouched();
    if (this.hasPassword() && !current) {
      return this.setStatus('password', { kind: 'error', text: t.currentRequired });
    }
    if (this.passwordForm.invalid) {
      return this.setStatus('password', null);
    }
    if (password !== confirm) {
      return this.setStatus('password', { kind: 'error', text: t.passwordMismatch });
    }
    const changing = this.hasPassword();
    await this.run('password', changing ? t.passwordChanged : t.passwordSet, async () => {
      if (changing) {
        await this.profiles.changePassword(current, password);
      } else {
        await this.profiles.setPassword(password);
      }
      this.passwordForm.reset();
    });
  }

  protected async sendReset(): Promise<void> {
    const email = this.email();
    await this.run('password', this.i18n.messages().profile.resetSent(email), () =>
      this.auth.sendPasswordReset(email),
    );
  }

  protected useLanguage(language: string): void {
    this.i18n.use(language as Language);
  }

  private async loadPractice(): Promise<void> {
    await this.auth.whenReady();
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    try {
      this.sessions.set(await this.practice.mySessions(uid, PRACTICE_SESSIONS));
    } catch {
      this.practiceFailed.set(true);
      this.sessions.set([]);
    }
  }

  private async run(section: Section, done: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(section);
    // One message at a time: a new action clears the last one, whatever section it was in.
    this.status.set({});
    try {
      await action();
      this.setStatus(section, { kind: 'notice', text: done });
    } catch (e) {
      this.setStatus(section, { kind: 'error', text: this.errorText(e) });
    } finally {
      this.busy.set(null);
    }
  }

  private errorText(error: unknown): string {
    const messages = this.i18n.messages();
    if (error instanceof PhotoError) {
      return messages.profile.photoErrors[error.reason];
    }
    return authErrorMessage(error, messages.auth.errors);
  }

  private setStatus(section: Section, status: Status | null): void {
    this.status.update((all) => ({ ...all, [section]: status ?? undefined }));
  }
}
