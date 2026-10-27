import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { MAX_NOTE_LENGTH, MentorNote, NoteTarget } from '../../core/models/mentor-note';
import { Icon } from '../../shared/icon/icon';
import { MentorNotesService, NoteAccess } from './mentor-notes.service';

/**
 * A mentor's notes on one piece of a student's work (a practice session, an evaluation attempt
 * or a form attempt). Staff read them all; admins and the mentors of the student's mentorships
 * also write, edit their own and (admins) delete any. The student reads them; with none, the
 * block stays hidden for them.
 */
@Component({
  selector: 'app-mentor-notes',
  imports: [Icon, LocalDatePipe],
  templateUrl: './mentor-notes.html',
  styleUrls: ['../../shared/icon/_icon-button.scss', './mentor-notes.scss'],
})
export class MentorNotes {
  readonly target = input.required<NoteTarget>();
  /** A label for the student's view, e.g. the attempt number. */
  readonly label = input('');

  private readonly service = inject(MentorNotesService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly maxLength = MAX_NOTE_LENGTH;

  protected readonly notes = signal<MentorNote[] | null>(null);
  protected readonly access = signal<NoteAccess | null>(null);
  protected readonly failed = signal(false);
  protected readonly draft = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The note being edited and its text. */
  protected readonly editing = signal<{ id: string; text: string } | null>(null);

  protected readonly staff = computed(() => this.auth.isStaff());
  protected readonly visible = computed(
    () => this.staff() || this.failed() || (this.notes()?.length ?? 0) > 0,
  );

  constructor() {
    effect(() => {
      const target = this.target();
      untracked(() => void this.load(target));
    });
  }

  protected mine(note: MentorNote): boolean {
    return note.authorId === this.auth.user()?.uid;
  }

  protected edited(note: MentorNote): boolean {
    return (note.updatedAt?.toMillis() ?? 0) - (note.createdAt?.toMillis() ?? 0) > 1000;
  }

  protected async add(): Promise<void> {
    const text = this.draft().trim();
    const access = this.access();
    if (!text || !access?.canWrite || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.service.add(this.target(), text, access.mentorshipId);
      this.draft.set('');
      await this.reload();
    } catch {
      this.error.set(this.i18n.messages().notes.saveFailed);
    } finally {
      this.saving.set(false);
    }
  }

  protected async saveEdit(): Promise<void> {
    const editing = this.editing();
    const text = editing?.text.trim();
    if (!editing || !text || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.service.edit(editing.id, text);
      this.editing.set(null);
      await this.reload();
    } catch {
      this.error.set(this.i18n.messages().notes.saveFailed);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(note: MentorNote): Promise<void> {
    const t = this.i18n.messages().notes;
    if (!confirm(t.confirmRemove)) {
      return;
    }
    this.error.set(null);
    try {
      await this.service.remove(note.id);
      this.notes.update((list) => list?.filter((n) => n.id !== note.id) ?? null);
    } catch {
      this.error.set(t.removeFailed);
    }
  }

  private async load(target: NoteTarget): Promise<void> {
    this.notes.set(null);
    this.access.set(null);
    this.failed.set(false);
    this.editing.set(null);
    this.error.set(null);
    if (this.staff()) {
      this.service
        .access(target.studentId)
        .then((access) => this.target() === target && this.access.set(access))
        .catch(() => this.access.set({ canWrite: false, mentorshipId: null }));
    }
    await this.reload();
  }

  private async reload(): Promise<void> {
    const target = this.target();
    try {
      const notes = await this.service.forTarget(target);
      if (this.target() === target) {
        this.notes.set(notes);
      }
    } catch {
      this.failed.set(true);
      this.notes.set([]);
    }
  }
}
