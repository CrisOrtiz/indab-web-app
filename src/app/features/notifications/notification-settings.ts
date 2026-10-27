import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { Mentorship } from '../../core/models/mentorship';
import {
  ACTIVITY_TYPES,
  ActivityType,
  DEFAULT_SETTINGS,
  MAX_FOLLOWS,
  NotificationSettings,
  followedSubjects,
} from '../../core/models/notification';
import { EvaluationService, StudentOption } from '../evaluations/evaluation.service';
import { ExamService } from '../exams/exam.service';
import { MentorshipService } from '../mentorships/mentorship.service';
import { NotificationService } from './notification.service';

type IdList = 'studentIds' | 'mentorshipIds' | 'evaluationIds' | 'examIds';

/**
 * Part of `/profile` for trainers and admins: which student activity reaches their bell and
 * whose. Nothing is followed until they pick it (everyone, mentorships, students, evaluations
 * or forms), so nobody gets notifications they did not ask for.
 */
@Component({
  selector: 'app-notification-settings',
  templateUrl: './notification-settings.html',
  styleUrls: ['../profile/profile.scss', './notification-settings.scss'],
})
export class NotificationSettingsPanel {
  private readonly service = inject(NotificationService);
  private readonly evaluationService = inject(EvaluationService);
  private readonly exams = inject(ExamService);
  private readonly mentorshipService = inject(MentorshipService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly types = ACTIVITY_TYPES;
  protected readonly loading = signal(true);
  protected readonly draft = signal<NotificationSettings>(DEFAULT_SETTINGS);
  private readonly saved = signal<NotificationSettings>(DEFAULT_SETTINGS);
  protected readonly saving = signal(false);
  protected readonly status = signal<{ kind: 'error' | 'notice'; text: string } | null>(null);

  protected readonly mentorships = signal<Mentorship[]>([]);
  protected readonly students = signal<StudentOption[]>([]);
  protected readonly evaluations = signal<{ id: string; title: string }[]>([]);
  protected readonly forms = signal<{ id: string; title: string }[]>([]);

  protected readonly nothingFollowed = computed(() => followedSubjects(this.draft()).length === 0);
  protected readonly followedStudents = computed(() => {
    const names = new Map(this.students().map((s) => [s.uid, s.name]));
    return this.draft().studentIds.map((uid) => ({ uid, name: names.get(uid) ?? uid }));
  });
  protected readonly otherStudents = computed(() => {
    const followed = new Set(this.draft().studentIds);
    return this.students().filter((s) => !followed.has(s.uid));
  });
  protected readonly dirty = computed(
    () => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()),
  );

  constructor() {
    void this.load();
  }

  protected leads(m: Mentorship): boolean {
    return m.mentorIds.includes(this.auth.user()?.uid ?? '');
  }

  protected hasType(type: ActivityType): boolean {
    return this.draft().types.includes(type);
  }

  protected toggleType(type: ActivityType, on: boolean): void {
    this.update({
      types: ACTIVITY_TYPES.filter((t) => (t === type ? on : this.hasType(t))),
    });
  }

  protected setAll(all: boolean): void {
    this.update({ all });
  }

  protected has(list: IdList, id: string): boolean {
    return this.draft()[list].includes(id);
  }

  protected toggle(list: IdList, id: string, on: boolean): void {
    const current = this.draft()[list].filter((x) => x !== id);
    if (on && current.length >= MAX_FOLLOWS) {
      this.status.set({
        kind: 'error',
        text: this.i18n.messages().notifications.settings.tooMany(MAX_FOLLOWS),
      });
      return;
    }
    this.update({ [list]: on ? [...current, id] : current });
  }

  protected addStudent(select: HTMLSelectElement): void {
    if (select.value) {
      this.toggle('studentIds', select.value, true);
      select.value = '';
    }
  }

  protected async save(): Promise<void> {
    const uid = this.auth.user()?.uid;
    const t = this.i18n.messages().notifications.settings;
    if (!uid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.status.set(null);
    try {
      const next = this.draft();
      await this.service.saveSettings(uid, next, this.saved());
      this.saved.set(next);
      this.status.set({ kind: 'notice', text: t.saved });
    } catch {
      this.status.set({ kind: 'error', text: t.saveFailed });
    } finally {
      this.saving.set(false);
    }
  }

  private update(change: Partial<NotificationSettings>): void {
    this.status.set(null);
    this.draft.update((d) => ({ ...d, ...change }));
  }

  private async load(): Promise<void> {
    const uid = this.auth.user()?.uid;
    try {
      const settings = uid ? await this.service.settings(uid) : DEFAULT_SETTINGS;
      this.draft.set(settings);
      this.saved.set(settings);
    } catch {
      this.status.set({
        kind: 'error',
        text: this.i18n.messages().notifications.settings.loadFailed,
      });
    } finally {
      this.loading.set(false);
    }
    // The lists to pick from; each one is optional.
    this.mentorshipService
      .all()
      .then((list) => this.mentorships.set(list))
      .catch(() => undefined);
    this.evaluationService
      .students()
      .then((list) => this.students.set(list))
      .catch(() => undefined);
    this.evaluationService
      .all()
      .then((list) => this.evaluations.set(list.map(({ id, title }) => ({ id, title }))))
      .catch(() => undefined);
    this.exams
      .all()
      .then((list) => this.forms.set(list.map(({ id, title }) => ({ id, title }))))
      .catch(() => undefined);
    // Opened from the bell's link (`/profile#notifications`).
    if (this.route.snapshot.fragment === 'notifications') {
      afterNextRender(() => this.host.nativeElement.scrollIntoView({ block: 'start' }), {
        injector: this.injector,
      });
    }
  }
}
