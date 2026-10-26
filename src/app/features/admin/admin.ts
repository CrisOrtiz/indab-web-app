import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { UserRole } from '../../core/models/user-profile';
import { Reveal } from '../../shared/reveal/reveal';
import { AdminService } from './admin.service';
import { AdminUserFilter, AdminUserRow, filterUsers, hasAcademyAccess } from './admin-users';

type AdminCard = 'users' | 'exams' | 'evaluations' | 'practice';

// Admin home: a card per tool, then the user management (admins only).
@Component({
  selector: 'app-admin',
  imports: [LocalDatePipe, NgTemplateOutlet, Reveal, RouterLink],
  providers: [AdminService],
  templateUrl: './admin.html',
  styleUrls: ['./admin.scss', './admin-home.scss'],
})
export class Admin {
  protected readonly admin = inject(AdminService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  /** A card per admin tool; the users card (admins only) scrolls to the list below. */
  protected readonly cards = computed<{ key: AdminCard; link: string | null }[]>(() => [
    ...(this.auth.isAdmin() ? [{ key: 'users' as const, link: null }] : []),
    { key: 'exams', link: '/admin/forms' },
    { key: 'evaluations', link: '/admin/evaluations' },
    { key: 'practice', link: '/admin/practice' },
  ]);
  private readonly usersSection = viewChild<ElementRef<HTMLElement>>('users');

  protected readonly filter = signal<AdminUserFilter>({ search: '', role: 'all', access: 'all' });
  protected readonly visible = computed(() => filterUsers(this.admin.users(), this.filter()));
  protected readonly stats = computed(() => {
    const users = this.admin.users();
    return {
      total: users.length,
      granted: users.filter(hasAcademyAccess).length,
      admins: users.filter((row) => row.profile.role === 'admin').length,
      trainers: users.filter((row) => row.profile.role === 'trainer').length,
    };
  });

  /** uids with a write in flight, to disable their controls. */
  protected readonly saving = signal<ReadonlySet<string>>(new Set());
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  protected readonly hasAcademyAccess = hasAcademyAccess;

  protected showUsers(): void {
    this.usersSection()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected isSelf(row: AdminUserRow): boolean {
    return row.profile.uid === this.auth.user()?.uid;
  }

  protected label(row: AdminUserRow): string {
    return row.profile.displayName || row.profile.email || row.profile.uid;
  }

  protected updateFilter(patch: Partial<AdminUserFilter>): void {
    this.filter.update((current) => ({ ...current, ...patch }));
  }

  protected async changeRole(row: AdminUserRow, select: HTMLSelectElement): Promise<void> {
    const role = select.value as UserRole;
    const t = this.i18n.messages().admin;
    if (role === 'admin' && !confirm(t.confirmAdmin(this.label(row)))) {
      select.value = row.profile.role;
      return;
    }
    const ok = await this.save(
      row,
      () => this.admin.setRole(row.profile.uid, role),
      t.roleChanged(this.label(row), t.roles[role]),
    );
    if (!ok) {
      select.value = row.profile.role;
    }
  }

  protected async toggleAccess(row: AdminUserRow, input: HTMLInputElement): Promise<void> {
    const academy = input.checked;
    const t = this.i18n.messages().admin;
    const text = academy ? t.accessGranted(this.label(row)) : t.accessRemoved(this.label(row));
    const ok = await this.save(
      row,
      () => this.admin.setAcademyAccess(row.profile.uid, academy),
      text,
    );
    if (!ok) {
      input.checked = !academy;
    }
  }

  private async save(
    row: AdminUserRow,
    write: () => Promise<void>,
    success: string,
  ): Promise<boolean> {
    const uid = row.profile.uid;
    this.saving.update((set) => new Set(set).add(uid));
    try {
      await write();
      this.message.set({ kind: 'ok', text: success });
      return true;
    } catch {
      this.message.set({
        kind: 'error',
        text: this.i18n.messages().admin.saveFailed(this.label(row)),
      });
      return false;
    } finally {
      this.saving.update((set) => {
        const next = new Set(set);
        next.delete(uid);
        return next;
      });
    }
  }
}
