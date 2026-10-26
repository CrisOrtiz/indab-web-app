import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, IconName } from '../icon/icon';

/** One entry of an `ActionsMenu`: a link when it has `link`, otherwise a button. */
export interface MenuAction {
  id: string;
  label: string;
  icon: IconName;
  link?: string[];
  /** Destructive actions (delete) are drawn in the error color. */
  danger?: boolean;
}

let nextId = 0;

/**
 * A three-dot button that opens a menu of actions, each with its icon and text (as on the
 * forms and evaluations cards). Emits the picked action's `id`; link actions navigate.
 * Closes on Escape, a click outside or a pick, and moves with the arrow keys.
 */
@Component({
  selector: 'app-actions-menu',
  imports: [Icon, RouterLink],
  templateUrl: './actions-menu.html',
  styleUrl: './actions-menu.scss',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(keydown.escape)': 'close(true)',
  },
})
export class ActionsMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly actions = input.required<MenuAction[]>();
  /** Accessible name of the three-dot button, e.g. "Acciones: Final de oro". */
  readonly label = input.required<string>();
  readonly picked = output<string>();

  protected readonly open = signal(false);
  protected readonly menuId = `actions-menu-${nextId++}`;

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    // Keyboard and screen reader users land on the first action.
    setTimeout(() => this.items()[0]?.focus());
  }

  close(returnFocus = false): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (returnFocus) {
      this.host.nativeElement.querySelector<HTMLElement>('.trigger')?.focus();
    }
  }

  protected pick(action: MenuAction): void {
    this.close(true);
    this.picked.emit(action.id);
  }

  protected move(event: KeyboardEvent): void {
    const items = this.items();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown'
        ? (at + 1) % items.length
        : event.key === 'ArrowUp'
          ? (at - 1 + items.length) % items.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
    } else if (event.key === 'Tab') {
      this.close();
    }
  }

  protected closeOnOutsideClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  private items(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }
}
