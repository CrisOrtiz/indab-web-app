import { Component, computed, inject, input, model, signal } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n.service';
import { Mentorship, audienceIds, membersOf } from '../../../core/models/mentorship';
import { StudentOption } from '../../evaluations/evaluation.service';

/**
 * Who a form or practice evaluation is for: whole mentorships and students picked by name.
 * Students already in a ticked mentorship show as included; the total counts each student once.
 * Only students with academy access are offered (the others cannot take it).
 */
@Component({
  selector: 'app-audience-picker',
  templateUrl: './audience-picker.html',
  styleUrl: './audience-picker.scss',
})
export class AudiencePicker {
  protected readonly i18n = inject(I18n);

  readonly students = input.required<StudentOption[]>();
  readonly mentorships = input.required<Mentorship[]>();
  readonly studentIds = model.required<string[]>();
  readonly mentorshipIds = model.required<string[]>();

  protected readonly search = signal('');

  private readonly eligible = computed(() => this.students().filter((s) => s.academy));

  /** Active mentorships, plus inactive ones that are already ticked. */
  protected readonly offered = computed(() => {
    const ticked = new Set(this.mentorshipIds());
    return this.mentorships().filter((m) => m.active || ticked.has(m.id));
  });

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    const list = this.eligible();
    return term ? list.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(term)) : list;
  });

  /** For each student covered by a ticked mentorship, that mentorship's name. */
  protected readonly covered = computed(() => {
    const names = new Map(this.mentorships().map((m) => [m.id, m.name]));
    const ticked = this.mentorshipIds();
    const covered = new Map<string, string>();
    for (const s of this.eligible()) {
      const via = s.mentorshipIds.find((id) => ticked.includes(id));
      if (via) {
        covered.set(s.uid, names.get(via) ?? '');
      }
    }
    return covered;
  });

  protected readonly total = computed(() => {
    const eligible = new Set(this.eligible().map((s) => s.uid));
    return audienceIds(
      { studentIds: this.studentIds(), mentorshipIds: this.mentorshipIds() },
      this.eligible(),
    ).filter((uid) => eligible.has(uid)).length;
  });

  protected memberCount(mentorshipId: string): number {
    return membersOf(mentorshipId, this.eligible()).length;
  }

  protected toggleMentorship(id: string, on: boolean): void {
    const ids = this.mentorshipIds();
    this.mentorshipIds.set(on ? [...new Set([...ids, id])] : ids.filter((m) => m !== id));
  }

  protected toggleStudent(uid: string, on: boolean): void {
    const ids = this.studentIds();
    this.studentIds.set(on ? [...new Set([...ids, uid])] : ids.filter((id) => id !== uid));
  }

  protected selectAll(): void {
    this.studentIds.set([...new Set([...this.studentIds(), ...this.visible().map((s) => s.uid)])]);
  }
}
