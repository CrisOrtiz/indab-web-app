import { Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { Icon } from '../../shared/icon/icon';

/**
 * The replay's transport bar: next bar, a round play/pause button whose ring spins faster with
 * the speed, the speed as a sliding segmented control, and the end-session button. Space plays
 * and pauses (the practice page already steps with the right arrow).
 */
@Component({
  selector: 'app-replay-controls',
  imports: [Icon],
  templateUrl: './replay-controls.html',
  styleUrl: './replay-controls.scss',
  host: { '(window:keydown)': 'onKey($event)' },
})
export class ReplayControls {
  readonly playing = input.required<boolean>();
  /** Bars per second. */
  readonly speed = input.required<number>();
  readonly speeds = input.required<readonly number[]>();

  readonly step = output<void>();
  readonly togglePlay = output<void>();
  readonly speedChange = output<number>();
  readonly finish = output<void>();

  protected readonly i18n = inject(I18n);

  protected readonly speedIndex = computed(() => Math.max(0, this.speeds().indexOf(this.speed())));
  /** One turn of the play button's ring: 3 s at 1 bar/s, quicker as the speed goes up. */
  protected readonly spin = computed(() => `${(3 / (1 + Math.log2(this.speed()))).toFixed(2)}s`);

  protected onKey(event: KeyboardEvent): void {
    const target = event.target;
    const busy =
      target instanceof Element &&
      target.closest('input, select, textarea, button, a, [contenteditable="true"]');
    if (event.key === ' ' && !busy && !event.repeat) {
      event.preventDefault();
      this.togglePlay.emit();
    }
  }
}
