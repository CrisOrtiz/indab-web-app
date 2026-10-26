import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { I18n } from '../../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { Mentorship, dayDate, membersOf } from '../../../core/models/mentorship';
import { ActionsMenu, MenuAction } from '../../../shared/actions-menu/actions-menu';
import { Icon } from '../../../shared/icon/icon';
import {
  EvaluationService,
  StaffOption,
  StudentOption,
} from '../../evaluations/evaluation.service';
import { MentorshipInput, MentorshipService } from '../../mentorships/mentorship.service';

/** The mentorship form, as the inputs hold it. */
export interface MentorshipForm {
  name: string;
  description: string;
  mentorIds: string[];
  /** yyyy-mm-dd; `endDate` empty while it has no end. */
  startDate: string;
  endDate: string;
  active: boolean;
}

/** Today as a `date` input value, in local time. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The first problem with the form (a message key), or null when it can be saved. */
export function mentorshipProblem(
  form: MentorshipForm,
): 'nameRequired' | 'mentorsRequired' | 'startRequired' | 'endBeforeStart' | null {
  if (!form.name.trim()) {
    return 'nameRequired';
  }
  if (!form.mentorIds.length) {
    return 'mentorsRequired';
  }
  if (!dayDate(form.startDate)) {
    return 'startRequired';
  }
  if (form.endDate && form.endDate < form.startDate) {
    return 'endBeforeStart';
  }
  return null;
}

/**
 * Mentorships group students under their mentors (trainers or admins). Admins create, edit,
 * pause and delete them here and add students from `/admin/users`; trainers see them, with their
 * students, to assign forms and evaluations to a whole group.
 */
@Component({
  selector: 'app-admin-mentorships',
  imports: [ActionsMenu, Icon, LocalDatePipe, RouterLink],
  templateUrl: './admin-mentorships.html',
  styleUrls: [
    '../admin.scss',
    '../evaluations/admin-evaluations.scss',
    '../../../shared/pager/_list-filters.scss',
    './admin-mentorships.scss',
  ],
})
export class AdminMentorships {
  private readonly service = inject(MentorshipService);
  private readonly directory = inject(EvaluationService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly mentorships = signal<Mentorship[]>([]);
  protected readonly students = signal<StudentOption[]>([]);
  protected readonly staff = signal<StaffOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  /** The form, while creating (`editing` null) or editing a mentorship. */
  protected readonly form = signal<MentorshipForm | null>(null);
  protected readonly editing = signal<Mentorship | null>(null);
  protected readonly saving = signal(false);

  /** Mentorship whose students are shown. */
  protected readonly selected = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly status = signal<'' | 'active' | 'inactive'>('');
  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    return this.mentorships().filter(
      (m) =>
        (!term || m.name.toLowerCase().includes(term)) &&
        (!status || m.active === (status === 'active')),
    );
  });

  protected readonly stats = computed(() => {
    const list = this.mentorships();
    const ids = new Set(list.map((m) => m.id));
    return {
      total: list.length,
      active: list.filter((m) => m.active).length,
      students: this.students().filter((s) => s.mentorshipIds.some((id) => ids.has(id))).length,
    };
  });

  protected readonly staffNames = computed(() => new Map(this.staff().map((s) => [s.uid, s.name])));

  /** Each mentorship's card menu, by id; trainers only see its students. */
  protected readonly menus = computed(() => {
    const t = this.i18n.messages().mentorships;
    const selected = this.selected();
    const admin = this.auth.isAdmin();
    return new Map(
      this.mentorships().map((m): [string, MenuAction[]] => [
        m.id,
        [
          {
            id: 'members',
            label: selected === m.id ? t.hideMembers : t.showMembers,
            icon: 'users',
          },
          ...(admin
            ? [
                { id: 'edit', label: t.edit, icon: 'edit' as const },
                {
                  id: 'toggle',
                  label: m.active ? t.deactivate : t.activate,
                  icon: m.active ? ('pause' as const) : ('play' as const),
                },
                { id: 'delete', label: t.delete, icon: 'trash' as const, danger: true },
              ]
            : []),
        ],
      ]),
    );
  });

  protected readonly dayDate = dayDate;

  constructor() {
    void this.load();
  }

  protected members(mentorship: Mentorship): StudentOption[] {
    const ids = new Set(membersOf(mentorship.id, this.students()));
    return this.students().filter((s) => ids.has(s.uid));
  }

  protected mentorNames(mentorship: Mentorship): string {
    const t = this.i18n.messages().mentorships;
    return mentorship.mentorIds
      .map((uid) => this.staffNames().get(uid) ?? t.formerMentor)
      .join(', ');
  }

  protected act(mentorship: Mentorship, action: string): void {
    if (action === 'members') {
      this.selected.set(this.selected() === mentorship.id ? null : mentorship.id);
    } else if (action === 'edit') {
      this.edit(mentorship);
    } else if (action === 'toggle') {
      void this.toggleActive(mentorship);
    } else if (action === 'delete') {
      void this.remove(mentorship);
    }
  }

  protected create(): void {
    this.editing.set(null);
    this.message.set(null);
    this.form.set({
      name: '',
      description: '',
      mentorIds: [],
      startDate: today(),
      endDate: '',
      active: true,
    });
  }

  protected edit(mentorship: Mentorship): void {
    this.editing.set(mentorship);
    this.message.set(null);
    this.form.set({
      name: mentorship.name,
      description: mentorship.description,
      mentorIds: [...mentorship.mentorIds],
      startDate: mentorship.startDate,
      endDate: mentorship.endDate ?? '',
      active: mentorship.active,
    });
  }

  protected cancel(): void {
    this.form.set(null);
    this.editing.set(null);
  }

  protected patch(change: Partial<MentorshipForm>): void {
    this.form.update((form) => (form ? { ...form, ...change } : form));
  }

  protected toggleMentor(uid: string, on: boolean): void {
    const ids = this.form()?.mentorIds ?? [];
    this.patch({ mentorIds: on ? [...new Set([...ids, uid])] : ids.filter((id) => id !== uid) });
  }

  protected async save(): Promise<void> {
    const form = this.form();
    const t = this.i18n.messages().mentorships;
    if (!form) {
      return;
    }
    const problem = mentorshipProblem(form);
    if (problem) {
      this.message.set({ kind: 'error', text: t[problem] });
      return;
    }
    const input: MentorshipInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      mentorIds: form.mentorIds,
      startDate: form.startDate,
      endDate: form.endDate || null,
      active: form.active,
    };
    const editing = this.editing();
    this.saving.set(true);
    try {
      if (editing) {
        await this.service.update(editing.id, input);
      } else {
        await this.service.create(input);
      }
      this.message.set({ kind: 'ok', text: t.saved(input.name) });
      this.cancel();
      this.mentorships.set(await this.service.all());
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggleActive(mentorship: Mentorship): Promise<void> {
    const t = this.i18n.messages().mentorships;
    const active = !mentorship.active;
    try {
      await this.service.update(mentorship.id, { active });
      this.mentorships.update((list) =>
        list.map((m) => (m.id === mentorship.id ? { ...m, active } : m)),
      );
      this.message.set({
        kind: 'ok',
        text: active ? t.activated(mentorship.name) : t.deactivated(mentorship.name),
      });
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    }
  }

  protected async remove(mentorship: Mentorship): Promise<void> {
    const t = this.i18n.messages().mentorships;
    if (!confirm(t.confirmDelete(mentorship.name, this.members(mentorship).length))) {
      return;
    }
    try {
      await this.service.remove(mentorship.id);
      this.mentorships.update((list) => list.filter((m) => m.id !== mentorship.id));
      this.students.update((list) =>
        list.map((s) => ({
          ...s,
          mentorshipIds: s.mentorshipIds.filter((id) => id !== mentorship.id),
        })),
      );
      if (this.selected() === mentorship.id) {
        this.selected.set(null);
      }
      this.message.set({ kind: 'ok', text: t.deletedOk(mentorship.name) });
    } catch {
      this.message.set({ kind: 'error', text: t.deleteFailed });
    }
  }

  private async load(): Promise<void> {
    try {
      const [mentorships, people] = await Promise.all([
        this.service.all(),
        this.directory.directory(),
      ]);
      this.mentorships.set(mentorships);
      this.students.set(people.students);
      this.staff.set(people.staff);
    } catch {
      this.message.set({ kind: 'error', text: this.i18n.messages().mentorships.loadFailed });
    } finally {
      this.loading.set(false);
    }
  }
}
