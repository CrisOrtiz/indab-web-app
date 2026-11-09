import { Component, ElementRef, computed, inject, input, output, viewChild } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { Icon } from '../../shared/icon/icon';

/**
 * The replay's transport bar: next bar, a round play/pause button whose ring spins faster with
 * the speed, the speed as a sliding segmented control, the leave-open button and the end-session button. Space plays
 * and pauses (the practice page already steps with the right arrow). A `live` replay (an
 * evaluation run by the clock) only shows that it is live, with the leave and end buttons.
 * Ending asks first in a modal dialog, so a stray click does not close the session.
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
  /** The replay runs by the clock: no step, pause or speed. */
  readonly live = input(false);

  readonly step = output<void>();
  readonly togglePlay = output<void>();
  readonly speedChange = output<number>();
  /** Back to the list, leaving the session open where it is. */
  readonly leave = output<void>();
  /** The student confirmed ending the session. */
  readonly finish = output<void>();

  protected readonly i18n = inject(I18n);

  protected readonly speedIndex = computed(() => Math.max(0, this.speeds().indexOf(this.speed())));
  /** One turn of the play button's ring: 3 s at 1 bar/s, quicker as the speed goes up. */
  protected readonly spin = computed(() => `${(3 / (1 + Math.log2(this.speed()))).toFixed(2)}s`);

  private readonly confirm = viewChild.required<ElementRef<HTMLDialogElement>>('confirm');

  protected askFinish(): void {
    const dialog = this.confirm().nativeElement;
    if (dialog.open) {
      return;
    }
    if (dialog.showModal) {
      dialog.showModal();
    } else {
      // Browsers (and test DOMs) without modal dialogs still show it.
      dialog.setAttribute('open', '');
    }
  }

  protected closeConfirm(): void {
    const dialog = this.confirm().nativeElement;
    if (dialog.close) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  protected confirmFinish(): void {
    this.closeConfirm();
    this.finish.emit();
  }

  /** A click on the dimmed backdrop (the dialog element itself) keeps the session going. */
  protected backdropClick(event: MouseEvent): void {
    if (event.target === this.confirm().nativeElement) {
      this.closeConfirm();
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target;
    const busy =
      target instanceof Element &&
      target.closest('input, select, textarea, button, a, [contenteditable="true"]');
    if (event.key === ' ' && !busy && !event.repeat && !this.live()) {
      event.preventDefault();
      this.togglePlay.emit();
    }
  }
}
