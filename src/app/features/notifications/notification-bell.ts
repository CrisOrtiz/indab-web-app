import { Component, DestroyRef, ElementRef, computed, effect, inject, signal } from '@angular/core';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { AppNotification, notificationLink } from '../../core/models/notification';
import { Icon, IconName } from '../../shared/icon/icon';
import { NotificationService } from './notification.service';

/** Shown instead of a bigger unread count. */
export const MAX_BADGE = 9;

/**
 * The bell in the header: the signed-in user's latest notifications, live, with the unread
 * count. Opening one marks it read and goes to what it is about. Trainers and admins get a link
 * to choose what they follow. Loaded lazily by the header (it needs Firestore).
 */
@Component({
  selector: 'app-notification-bell',
  imports: [Icon, LocalDatePipe, RouterLink],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
})
export class NotificationBell {
  private readonly service = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly items = signal<AppNotification[]>([]);
  protected readonly failed = signal(false);
  protected readonly open = signal(false);
  protected readonly unread = computed(() => this.items().filter((n) => !n.read));
  protected readonly badge = computed(() => {
    const count = this.unread().length;
    return count > MAX_BADGE ? `${MAX_BADGE}+` : String(count);
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    let stop: (() => void) | null = null;
    effect(() => {
      stop?.();
      stop = null;
      const uid = this.auth.user()?.uid;
      this.items.set([]);
      if (uid) {
        stop = this.service.listen(
          uid,
          (list) => {
            this.failed.set(false);
            this.items.set(list);
          },
          () => this.failed.set(true),
        );
      }
    });
    destroyRef.onDestroy(() => stop?.());
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.open.set(false);
      }
    });
  }

  protected text(n: AppNotification): string {
    const t = this.i18n.messages().notifications.text;
    switch (n.type) {
      case 'note':
        return t.note(n.actorName, n.kind, n.title);
      case 'assigned':
        return t.assigned(n.kind, n.title);
      case 'results':
        return t.results(n.title);
      case 'practiceFinished':
        return t.practiceFinished(n.actorName);
      case 'evaluationFinished':
        return t.evaluationFinished(n.actorName, n.title);
      case 'examSubmitted':
        return t.examSubmitted(n.actorName, n.title);
    }
  }

  protected icon(n: AppNotification): IconName {
    return n.type === 'note' ? 'note' : n.kind === 'exam' ? 'grade' : 'results';
  }

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  protected async go(n: AppNotification): Promise<void> {
    this.open.set(false);
    if (!n.read) {
      this.markRead([n.id]);
    }
    const link = notificationLink(n);
    await this.router.navigate([link.path], { queryParams: link.query });
  }

  protected markAllRead(): void {
    this.markRead(this.unread().map((n) => n.id));
  }

  protected closeOnOutsideClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  private markRead(ids: string[]): void {
    const uid = this.auth.user()?.uid;
    if (!uid || !ids.length) {
      return;
    }
    // Shown as read at once; the listener brings the saved state back.
    this.items.update((list) => list.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    this.service.markRead(uid, ids).catch(() => undefined);
  }
}
