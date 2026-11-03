import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../../core/i18n/i18n.service';
import {
  MATERIAL_KINDS,
  MAX_MATERIAL_URL,
  Material,
  MaterialAudience,
  MaterialKind,
  materialEmbed,
} from '../../../core/models/material';
import { Mentorship, audienceIds } from '../../../core/models/mentorship';
import { ActionsMenu, MenuAction } from '../../../shared/actions-menu/actions-menu';
import { Icon } from '../../../shared/icon/icon';
import { EvaluationService, StudentOption } from '../../evaluations/evaluation.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { MaterialFrame } from '../../repository/material-frame';
import { MaterialInput, MaterialService } from '../../repository/material.service';
import { MaterialThumb } from '../../repository/material-thumb';
import { AudiencePicker } from '../audience/audience-picker';

/** The material form, as the inputs hold it. */
export interface MaterialForm {
  url: string;
  title: string;
  description: string;
  kind: MaterialKind;
  category: string;
  audience: MaterialAudience;
  studentIds: string[];
  mentorshipIds: string[];
  published: boolean;
}

/** The first problem with the form (a message key), or null when it can be saved. */
export function materialProblem(
  form: MaterialForm,
): 'badUrl' | 'titleRequired' | 'audienceRequired' | null {
  if (!materialEmbed(form.url) || form.url.trim().length > MAX_MATERIAL_URL) {
    return 'badUrl';
  }
  if (!form.title.trim()) {
    return 'titleRequired';
  }
  if (form.audience === 'selected' && !form.studentIds.length && !form.mentorshipIds.length) {
    return 'audienceRequired';
  }
  return null;
}

const emptyForm = (): MaterialForm => ({
  url: '',
  title: '',
  description: '',
  kind: 'video',
  category: '',
  audience: 'all',
  studentIds: [],
  mentorshipIds: [],
  published: true,
});

/**
 * Study material for the academy (`/admin/material`): trainers and admins paste the link of a
 * video, presentation or document (nothing is uploaded: Storage needs the Blaze plan), see how
 * it will look, choose who gets it and publish it; the card menu edits, hides or deletes it.
 */
@Component({
  selector: 'app-admin-material',
  imports: [ActionsMenu, AudiencePicker, Icon, MaterialFrame, MaterialThumb, RouterLink],
  templateUrl: './admin-material.html',
  styleUrls: [
    '../admin.scss',
    '../evaluations/admin-evaluations.scss',
    '../../../shared/pager/_list-filters.scss',
    './admin-material.scss',
  ],
})
export class AdminMaterial {
  private readonly service = inject(MaterialService);
  private readonly directory = inject(EvaluationService);
  private readonly mentorshipService = inject(MentorshipService);
  protected readonly i18n = inject(I18n);

  protected readonly kinds = MATERIAL_KINDS;
  protected readonly maxUrl = MAX_MATERIAL_URL;

  protected readonly items = signal<Material[]>([]);
  protected readonly students = signal<StudentOption[]>([]);
  protected readonly mentorships = signal<Mentorship[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  protected readonly form = signal<MaterialForm | null>(null);
  protected readonly editing = signal<Material | null>(null);
  protected readonly saving = signal(false);
  /** Once staff pick a type, a new link no longer changes it. */
  private kindPicked = false;

  /** How the form's link will show, or null while it is not an https link. */
  protected readonly embed = computed(() => {
    const url = this.form()?.url ?? '';
    return url.trim() ? materialEmbed(url) : null;
  });

  protected readonly search = signal('');
  protected readonly kindFilter = signal<MaterialKind | ''>('');
  protected readonly status = signal<'' | 'published' | 'draft'>('');
  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    const kind = this.kindFilter();
    const status = this.status();
    return this.items().filter(
      (m) =>
        (!kind || m.kind === kind) &&
        (!status || m.published === (status === 'published')) &&
        (!term || `${m.title} ${m.category}`.toLowerCase().includes(term)),
    );
  });

  protected readonly stats = computed(() => {
    const list = this.items();
    return {
      total: list.length,
      published: list.filter((m) => m.published).length,
      drafts: list.filter((m) => !m.published).length,
    };
  });

  /** Topics already used, offered while typing a new one. */
  protected readonly categories = computed(() =>
    [
      ...new Set(
        this.items()
          .map((m) => m.category.trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es')),
  );

  protected readonly menus = computed(() => {
    const t = this.i18n.messages().materialAdmin;
    return new Map(
      this.items().map((m): [string, MenuAction[]] => [
        m.id,
        [
          { id: 'view', label: t.view, icon: 'eye', link: ['/academy/material', m.id] },
          { id: 'edit', label: t.edit, icon: 'edit' },
          {
            id: 'toggle',
            label: m.published ? t.unpublish : t.publishAction,
            icon: m.published ? 'eyeOff' : 'play',
          },
          { id: 'delete', label: t.delete, icon: 'trash', danger: true },
        ],
      ]),
    );
  });

  constructor() {
    void this.load();
  }

  /** How many students a piece for chosen students reaches, mentorships included. */
  protected reach(m: Material): number {
    return audienceIds(m, this.students()).length;
  }

  protected act(m: Material, action: string): void {
    if (action === 'edit') {
      this.edit(m);
    } else if (action === 'toggle') {
      void this.togglePublished(m);
    } else if (action === 'delete') {
      void this.remove(m);
    }
  }

  protected create(): void {
    this.editing.set(null);
    this.message.set(null);
    this.kindPicked = false;
    this.form.set(emptyForm());
  }

  protected edit(m: Material): void {
    this.editing.set(m);
    this.message.set(null);
    this.kindPicked = true;
    this.form.set({
      url: m.url,
      title: m.title,
      description: m.description,
      kind: m.kind,
      category: m.category,
      audience: m.audience,
      studentIds: [...m.studentIds],
      mentorshipIds: [...(m.mentorshipIds ?? [])],
      published: m.published,
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  protected cancel(): void {
    this.form.set(null);
    this.editing.set(null);
  }

  protected patch(change: Partial<MaterialForm>): void {
    this.form.update((form) => (form ? { ...form, ...change } : form));
  }

  /** A new link also suggests its type until staff pick one. */
  protected setUrl(url: string): void {
    const kind = materialEmbed(url)?.kind;
    this.patch(kind && !this.kindPicked ? { url, kind } : { url });
  }

  protected setKind(kind: MaterialKind): void {
    this.kindPicked = true;
    this.patch({ kind });
  }

  protected async save(): Promise<void> {
    const form = this.form();
    const t = this.i18n.messages().materialAdmin;
    if (!form) {
      return;
    }
    const problem = materialProblem(form);
    if (problem) {
      this.message.set({ kind: 'error', text: t[problem] });
      return;
    }
    const selected = form.audience === 'selected';
    const input: MaterialInput = {
      url: form.url.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      kind: form.kind,
      category: form.category.trim(),
      audience: form.audience,
      studentIds: selected ? form.studentIds : [],
      mentorshipIds: selected ? form.mentorshipIds : [],
      published: form.published,
    };
    const editing = this.editing();
    this.saving.set(true);
    try {
      if (editing) {
        await this.service.update(editing.id, input);
      } else {
        await this.service.create(input);
      }
      this.message.set({ kind: 'ok', text: t.saved(input.title) });
      this.cancel();
      this.items.set(await this.service.all());
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    } finally {
      this.saving.set(false);
    }
  }

  protected async togglePublished(m: Material): Promise<void> {
    const t = this.i18n.messages().materialAdmin;
    const published = !m.published;
    try {
      await this.service.update(m.id, { published });
      this.items.update((list) => list.map((i) => (i.id === m.id ? { ...i, published } : i)));
      this.message.set({
        kind: 'ok',
        text: published ? t.publishedOk(m.title) : t.unpublishedOk(m.title),
      });
    } catch {
      this.message.set({ kind: 'error', text: t.saveFailed });
    }
  }

  protected async remove(m: Material): Promise<void> {
    const t = this.i18n.messages().materialAdmin;
    if (!confirm(t.confirmDelete(m.title))) {
      return;
    }
    try {
      await this.service.remove(m.id);
      this.items.update((list) => list.filter((i) => i.id !== m.id));
      if (this.editing()?.id === m.id) {
        this.cancel();
      }
      this.message.set({ kind: 'ok', text: t.deletedOk(m.title) });
    } catch {
      this.message.set({ kind: 'error', text: t.deleteFailed });
    }
  }

  private async load(): Promise<void> {
    try {
      const [items, students, mentorships] = await Promise.all([
        this.service.all(),
        this.directory.students(),
        this.mentorshipService.all(),
      ]);
      this.items.set(items);
      this.students.set(students);
      this.mentorships.set(mentorships);
    } catch {
      this.message.set({ kind: 'error', text: this.i18n.messages().materialAdmin.loadFailed });
    } finally {
      this.loading.set(false);
    }
  }
}
