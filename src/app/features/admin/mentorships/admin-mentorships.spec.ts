import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { EvaluationService } from '../../evaluations/evaluation.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { AdminMentorships, mentorshipProblem, today } from './admin-mentorships';

const gold = {
  id: 'm1',
  name: 'Grupo oro',
  description: 'Lunes y jueves',
  mentorIds: ['coach'],
  startDate: '2026-10-01',
  endDate: '2026-12-15',
  active: true,
};
const old = {
  id: 'm2',
  name: 'Grupo 2025',
  description: '',
  mentorIds: ['gone'],
  startDate: '2025-03-01',
  endDate: null,
  active: false,
};

describe('AdminMentorships', () => {
  let fixture: ComponentFixture<AdminMentorships>;
  let el: HTMLElement;
  const isAdmin = signal(true);
  const service = {
    all: vi.fn(),
    create: vi.fn(async () => 'new'),
    update: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
  const directory = {
    directory: vi.fn(async () => ({
      students: [
        { uid: 'ana', name: 'Ana Gómez', email: 'ana@x.co', academy: true, mentorshipIds: ['m1'] },
        { uid: 'eva', name: 'Eva Ruiz', email: 'eva@x.co', academy: false, mentorshipIds: ['m1'] },
        { uid: 'jose', name: 'José Pérez', email: 'jose@x.co', academy: true, mentorshipIds: [] },
      ],
      staff: [
        { uid: 'boss', name: 'Cris', role: 'admin' },
        { uid: 'coach', name: 'Marta Ruiz', role: 'trainer' },
      ],
    })),
  };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [AdminMentorships],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAdmin } },
        { provide: MentorshipService, useValue: service },
        { provide: EvaluationService, useValue: directory },
      ],
    });
    fixture = TestBed.createComponent(AdminMentorships);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    isAdmin.set(true);
    service.all.mockResolvedValue([gold, old]);
  });

  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  const menuItem = async (name: string, action: string) => {
    el.querySelector<HTMLButtonElement>(`[aria-label="Acciones: ${name}"]`)!.click();
    await fixture.whenStable();
    return [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (i) => i.textContent?.trim() === action,
    );
  };
  const type = async (selector: string, value: string, index = 0) => {
    const input = el.querySelectorAll<HTMLInputElement>(selector)[index];
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  const message = () => el.querySelector('.message')?.textContent ?? '';
  const cards = () => [...el.querySelectorAll('.card')].map((c) => c.textContent!);

  it('lists the mentorships with their dates, mentors and students', async () => {
    await render();
    expect([...el.querySelectorAll('.stat strong')].map((s) => s.textContent)).toEqual([
      '2',
      '1',
      '2',
    ]);
    expect(cards()[0]).toContain('Grupo oro');
    expect(cards()[0]).toContain('Activa');
    expect(cards()[0]).toContain('Del 1 oct 2026 al 15 dic 2026');
    expect(cards()[0]).toContain('2 estudiantes');
    expect(cards()[0]).toContain('Mentores: Marta Ruiz');
    expect(cards()[1]).toContain('Inactiva');
    expect(cards()[1]).toContain('Desde el 1 mar 2025');
    // A mentor who is no longer staff.
    expect(cards()[1]).toContain('Mentores: Ex mentor');
  });

  it('shows the students of a mentorship', async () => {
    await render();
    (await menuItem('Grupo oro', 'Ver estudiantes'))!.click();
    await fixture.whenStable();
    const members = el.querySelector('.members')!.textContent!;
    expect(members).toContain('Ana Gómez');
    expect(members).toContain('Eva Ruiz');
    expect(members).toContain('Sin acceso a la academia');
    expect(members).not.toContain('José Pérez');
    expect(el.querySelector('.members a')?.getAttribute('href')).toBe('/admin/users');
  });

  it('filters by name and status', async () => {
    await render();
    const status = el.querySelector<HTMLSelectElement>('.list-filters select')!;
    status.value = 'inactive';
    status.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toContain('Grupo 2025');
    status.value = '';
    status.dispatchEvent(new Event('change'));
    await type('.list-filters input', 'oro');
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toContain('Grupo oro');
  });

  it('creates a mentorship with its mentors and dates', async () => {
    await render();
    button('Nueva mentoría')!.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('input[type=date]')!.value).toBe(today());
    await submit();
    expect(message()).toContain('Escribe el nombre');
    await type('form input[type=text]', 'Grupo índices');
    await submit();
    expect(message()).toContain('Elige al menos un mentor');
    el.querySelector<HTMLInputElement>('.student-list input')!.click();
    await fixture.whenStable();
    await type('form input[type=date]', '2026-11-01');
    await type('form input[type=date]', '2026-10-01', 1);
    await submit();
    expect(message()).toContain('La fecha de fin debe ser posterior');
    await type('form input[type=date]', '', 1);
    service.all.mockResolvedValue([gold, old, { ...gold, id: 'new', name: 'Grupo índices' }]);
    await submit();
    expect(service.create).toHaveBeenCalledWith({
      name: 'Grupo índices',
      description: '',
      mentorIds: ['boss'],
      startDate: '2026-11-01',
      endDate: null,
      active: true,
    });
    expect(message()).toContain('Se guardó la mentoría Grupo índices.');
    expect(cards()).toHaveLength(3);
  });

  it('edits, pauses and deletes a mentorship', async () => {
    await render();
    (await menuItem('Grupo oro', 'Editar'))!.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('form input[type=text]')!.value).toBe('Grupo oro');
    await type('form input[type=text]', 'Grupo oro AM');
    await submit();
    expect(service.update).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({
        name: 'Grupo oro AM',
        mentorIds: ['coach'],
        endDate: '2026-12-15',
      }),
    );

    (await menuItem('Grupo oro', 'Desactivar'))!.click();
    await fixture.whenStable();
    expect(service.update).toHaveBeenLastCalledWith('m1', { active: false });
    expect(message()).toContain('quedó inactiva');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (await menuItem('Grupo oro', 'Eliminar'))!.click();
    await fixture.whenStable();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Sus 2 estudiantes'));
    expect(service.remove).toHaveBeenCalledWith('m1');
    expect(cards()).toHaveLength(1);
  });

  it('lets trainers see the mentorships and their students, not change them', async () => {
    isAdmin.set(false);
    await render();
    expect(button('Nueva mentoría')).toBeUndefined();
    expect(el.textContent).toContain('un administrador las crea');
    el.querySelector<HTMLButtonElement>('[aria-label="Acciones: Grupo oro"]')!.click();
    await fixture.whenStable();
    const actions = [...el.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim());
    expect(actions).toEqual(['Ver estudiantes']);
  });

  it('checks the form', () => {
    const form = {
      name: 'A',
      description: '',
      mentorIds: ['x'],
      startDate: '2026-10-01',
      endDate: '',
      active: true,
    };
    expect(mentorshipProblem(form)).toBeNull();
    expect(mentorshipProblem({ ...form, name: ' ' })).toBe('nameRequired');
    expect(mentorshipProblem({ ...form, mentorIds: [] })).toBe('mentorsRequired');
    expect(mentorshipProblem({ ...form, startDate: '' })).toBe('startRequired');
    expect(mentorshipProblem({ ...form, endDate: '2026-09-30' })).toBe('endBeforeStart');
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
