import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { Enrollment, UserProfile } from '../../../core/models/user-profile';
import { AdminUsers } from './users';
import { AdminService } from '../admin.service';
import { AdminUserRow } from '../admin-users';

const row = (uid: string, displayName: string, role: UserProfile['role'], academy?: boolean) =>
  ({
    profile: { uid, displayName, email: `${uid}@indab.co`, role } as UserProfile,
    enrollment: academy === undefined ? null : ({ academy, courses: [] } as unknown as Enrollment),
  }) as AdminUserRow;

describe('Admin users page', () => {
  let fixture: ComponentFixture<AdminUsers>;
  let el: HTMLElement;
  const rows = signal<AdminUserRow[]>([]);
  const fake = {
    users: computed(() => rows()),
    loading: signal(false),
    error: signal<string | null>(null),
    setRole: vi.fn(async () => undefined),
    setAcademyAccess: vi.fn(async () => undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    fake.loading.set(false);
    fake.error.set(null);
    rows.set([
      row('boss', 'Ana Admin', 'admin'),
      row('jose', 'José Pérez', 'student', true),
      row('luis', 'Luis Díaz', 'student'),
      row('marta', 'Marta Ruiz', 'trainer', true),
    ]);
    TestBed.configureTestingModule({
      imports: [AdminUsers],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: 'boss' }) } },
      ],
    });
    TestBed.overrideComponent(AdminUsers, {
      set: { providers: [{ provide: AdminService, useValue: fake }] },
    });
    fixture = TestBed.createComponent(AdminUsers);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const rowOf = (name: string) =>
    [...el.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(name))!;
  const roleSelect = (name: string) => rowOf(name).querySelector('select')!;
  const accessInput = (name: string) => rowOf(name).querySelector<HTMLInputElement>('input')!;
  const names = () => [...el.querySelectorAll('tbody .name')].map((n) => n.textContent!.trim());
  const message = () => el.querySelector('.message')?.textContent?.trim() ?? '';
  const change = async (control: HTMLSelectElement | HTMLInputElement, value: string | boolean) => {
    if (typeof value === 'boolean') {
      (control as HTMLInputElement).checked = value;
    } else {
      control.value = value;
    }
    control.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };

  it('shows the totals and every user', () => {
    const stats = [...el.querySelectorAll('.stat strong')].map((s) => s.textContent);
    expect(stats).toEqual(['4', '2', '1', '1']);
    expect(names()).toEqual(['Ana Admin Tú', 'José Pérez', 'Luis Díaz', 'Marta Ruiz']);
    expect(el.textContent).toContain('4 de 4 usuarios');
  });

  it('has a title and a way back to the admin home', () => {
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Usuarios');
    expect(el.querySelector('a.back')?.getAttribute('href')).toBe('/admin');
  });

  it("links to a user's WhatsApp when they gave one", async () => {
    rows.update((list) =>
      list.map((r) =>
        r.profile.uid === 'jose'
          ? { ...r, profile: { ...r.profile, whatsapp: '+525512345678' } }
          : r,
      ),
    );
    await fixture.whenStable();
    const link = rowOf('José Pérez').querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://wa.me/525512345678');
    expect(link.textContent?.trim()).toBe('WhatsApp +525512345678');
    expect(rowOf('Luis Díaz').querySelector('a')).toBeNull();
  });

  it('appoints trainers', async () => {
    await change(roleSelect('Luis Díaz'), 'trainer');
    expect(fake.setRole).toHaveBeenCalledWith('luis', 'trainer');
    expect(message()).toContain('Luis Díaz ahora es entrenador.');
  });

  it('shows the loading and error states', async () => {
    fake.loading.set(true);
    await fixture.whenStable();
    expect(el.textContent).toContain('Cargando usuarios…');
    fake.loading.set(false);
    fake.error.set('No se pudo cargar la lista de usuarios.');
    await fixture.whenStable();
    expect(el.querySelector('table')).toBeNull();
    expect(el.textContent).toContain('No se pudo cargar la lista de usuarios.');
  });

  it('filters by search text, role and access', async () => {
    const search = el.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'jose';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names()).toEqual(['José Pérez']);
    expect(el.textContent).toContain('1 de 4 usuarios');

    search.value = 'nadie';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.textContent).toContain('No hay usuarios que coincidan');

    search.value = '';
    search.dispatchEvent(new Event('input'));
    await change(el.querySelector<HTMLSelectElement>('[aria-label="Filtrar por rol"]')!, 'admin');
    expect(names()).toEqual(['Ana Admin Tú']);
    await change(el.querySelector<HTMLSelectElement>('[aria-label="Filtrar por rol"]')!, 'trainer');
    expect(names()).toEqual(['Marta Ruiz']);
    await change(el.querySelector<HTMLSelectElement>('[aria-label="Filtrar por rol"]')!, 'all');
    await change(
      el.querySelector<HTMLSelectElement>('[aria-label="Filtrar por acceso"]')!,
      'pending',
    );
    expect(names()).toEqual(['Ana Admin Tú', 'Luis Díaz']);
  });

  it('does not let admins change their own role', () => {
    expect(roleSelect('Ana Admin').disabled).toBe(true);
    expect(roleSelect('Ana Admin').title).toContain('No puedes quitarte tu propio rol');
    expect(roleSelect('Luis Díaz').disabled).toBe(false);
  });

  it('asks before promoting to admin and reverts when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await change(roleSelect('Luis Díaz'), 'admin');
    expect(window.confirm).toHaveBeenCalledWith('¿Dar permisos de administrador a Luis Díaz?');
    expect(fake.setRole).not.toHaveBeenCalled();
    expect(roleSelect('Luis Díaz').value).toBe('student');
  });

  it('promotes a user after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await change(roleSelect('Luis Díaz'), 'admin');
    expect(fake.setRole).toHaveBeenCalledWith('luis', 'admin');
    expect(message()).toContain('Luis Díaz ahora es administrador.');
  });

  it('demotes without asking', async () => {
    rows.update((list) => [...list, row('eva', 'Eva Ruiz', 'admin')]);
    await fixture.whenStable();
    const confirm = vi.spyOn(window, 'confirm');
    await change(roleSelect('Eva Ruiz'), 'student');
    expect(confirm).not.toHaveBeenCalled();
    expect(fake.setRole).toHaveBeenCalledWith('eva', 'student');
    expect(message()).toContain('Eva Ruiz ahora es estudiante.');
  });

  it('reverts the role and shows an error when the write is denied', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fake.setRole.mockRejectedValueOnce(new Error('permission-denied'));
    await change(roleSelect('Luis Díaz'), 'admin');
    expect(roleSelect('Luis Díaz').value).toBe('student');
    expect(el.querySelector('.message.error')?.textContent).toContain(
      'No se pudo guardar el cambio para Luis Díaz.',
    );
  });

  it('grants and revokes academy access', async () => {
    await change(accessInput('Luis Díaz'), true);
    expect(fake.setAcademyAccess).toHaveBeenCalledWith('luis', true);
    expect(message()).toContain('Luis Díaz ahora tiene acceso a la academia.');

    await change(accessInput('José Pérez'), false);
    expect(fake.setAcademyAccess).toHaveBeenCalledWith('jose', false);
    expect(message()).toContain('Se quitó el acceso a la academia a José Pérez.');
  });

  it('unticks the switch again when granting access fails', async () => {
    fake.setAcademyAccess.mockRejectedValueOnce(new Error('permission-denied'));
    await change(accessInput('Luis Díaz'), true);
    expect(accessInput('Luis Díaz').checked).toBe(false);
    expect(el.querySelector('.message.error')).not.toBeNull();
  });

  it('disables a row while its change is saving', async () => {
    let finish!: () => void;
    fake.setAcademyAccess.mockReturnValueOnce(
      new Promise<undefined>((r) => (finish = () => r(undefined))),
    );
    accessInput('Luis Díaz').checked = true;
    accessInput('Luis Díaz').dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(accessInput('Luis Díaz').disabled).toBe(true);
    expect(roleSelect('Luis Díaz').disabled).toBe(true);
    expect(accessInput('José Pérez').disabled).toBe(false);
    finish();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(accessInput('Luis Díaz').disabled).toBe(false);
  });

  it('notes that admins already have access and lets the message be dismissed', async () => {
    expect(rowOf('Ana Admin').textContent).toContain('Los administradores ya tienen acceso.');
    await change(accessInput('Luis Díaz'), true);
    el.querySelector<HTMLButtonElement>('.dismiss')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.message')).toBeNull();
  });
});
