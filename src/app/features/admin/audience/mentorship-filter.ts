import { Component, computed, inject, input, model } from '@angular/core';
import { I18n } from '../../../core/i18n/i18n.service';
import { Mentorship } from '../../../core/models/mentorship';

/**
 * A "Mentorship" select for the filter bars (`.list-filters`) of staff lists: any mentorship, or
 * one of them (active ones first). Its host takes no box, so the label sits in the bar's row.
 */
@Component({
  selector: 'app-mentorship-filter',
  template: `
    @let t = i18n.messages().lists;
    <label>
      {{ t.mentorship }}
      <select [value]="value()" (change)="value.set($any($event.target).value)">
        <option value="">{{ t.allMentorships }}</option>
        @for (m of sorted(); track m.id) {
          <option [value]="m.id">
            {{ m.name }}{{ m.active ? '' : ' · ' + i18n.messages().audience.inactive }}
          </option>
        }
      </select>
    </label>
  `,
  styleUrl: './mentorship-filter.scss',
})
export class MentorshipFilter {
  protected readonly i18n = inject(I18n);

  readonly mentorships = input.required<Mentorship[]>();
  /** The mentorship id, or `''` for any. */
  readonly value = model('');

  protected readonly sorted = computed(() =>
    [...this.mentorships()].sort((a, b) => Number(b.active) - Number(a.active)),
  );
}
