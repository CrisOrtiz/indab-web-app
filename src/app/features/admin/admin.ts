import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/models/user-profile';
import { AdminService } from './admin.service';
import { AdminUserFilter, AdminUserRow, filterUsers, hasAcademyAccess } from './admin-users';

@Component({
  selector: 'app-admin',
  imports: [DatePipe, RouterLink],
  providers: [AdminService],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin {
  protected readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);

  protected readonly filter = signal<AdminUserFilter>({ search: '', role: 'all', access: 'all' });
  protected readonly visible = computed(() => filterUsers(this.admin.users(), this.filter()));
  protected readonly stats = computed(() => {
    const users = this.admin.users();
    return {
      total: users.length,
      granted: users.filter(hasAcademyAccess).length,
      admins: users.filter((row) => row.profile.role === 'admin').length,
    };
  });

  /** uids with a write in flight, to disable their controls. */
  protected readonly saving = signal<ReadonlySet<string>>(new Set());
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  protected readonly hasAcademyAccess = hasAcademyAccess;

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
    if (role === 'admin' && !confirm(`¿Dar permisos de administrador a ${this.label(row)}?`)) {
      select.value = row.profile.role;
      return;
    }
    const roleName = role === 'admin' ? 'administrador' : 'estudiante';
    const ok = await this.save(
      row,
      () => this.admin.setRole(row.profile.uid, role),
      `${this.label(row)} ahora es ${roleName}.`,
    );
    if (!ok) {
      select.value = row.profile.role;
    }
  }

  protected async toggleAccess(row: AdminUserRow, input: HTMLInputElement): Promise<void> {
    const academy = input.checked;
    const text = academy
      ? `${this.label(row)} ahora tiene acceso a la academia.`
      : `Se quitó el acceso a la academia a ${this.label(row)}.`;
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
        text: `No se pudo guardar el cambio para ${this.label(row)}. Intenta de nuevo.`,
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
