import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { Activity, Delivery } from './dashboard';
import { MentorDashboard } from './mentor-dashboard';
import { MentorDashboardService } from './mentor-dashboard.service';

const mentorship = (id: string, name: string, mentorIds: string[]) => ({
  id,
  name,
  mentorIds,
  active: true,
});
const activity = (sessions: number, pnl: number, closedTrades: number, wins: number): Activity => ({
  sessions,
  pnl,
  closedTrades,
  wins,
  lastPractice: sessions ? new Date(2026, 9, 27) : null,
});
const form: Delivery = {
  kind: 'form',
  id: 'f1',
  title: 'Examen de riesgo',
  closesAt: new Date(2026, 9, 30, 18),
  open: true,
  assigned: ['ana', 'luis'],
  done: ['ana'],
  results: { ana: 0.9 },
};

describe('MentorDashboard', () => {
  let fixture: ComponentFixture<MentorDashboard>;
  let el: HTMLElement;
  const isAdmin = signal(false);
  const mentorships = {
    all: vi.fn(async () => [
      mentorship('m1', 'Grupo oro', ['other']),
      mentorship('m2', 'Grupo plata', ['coach']),
    ]),
  };
  const service = {
    members: vi.fn(async (id: string) =>
      id === 'm2'
        ? [
            { uid: 'ana', name: 'Ana', email: 'ana@x.co', mentorshipIds: ['m2'] },
            { uid: 'luis', name: 'Luis', email: 'luis@x.co', mentorshipIds: ['m2'] },
          ]
        : [],
    ),
    activity: vi.fn(async (uid: string, _from: Date) =>
      uid === 'ana' ? activity(3, 40, 4, 3) : activity(0, 0, 0, 0),
    ),
    deliveries: vi.fn(async () => [form]),
  };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [MentorDashboard],
      providers: [
        provideRouter([]),
        { provide: MentorshipService, useValue: mentorships },
        { provide: MentorDashboardService, useValue: service },
        { provide: AuthService, useValue: { isAdmin, user: signal({ uid: 'coach' }) } },
      ],
    });
    fixture = TestBed.createComponent(MentorDashboard);
    el = fixture.nativeElement;
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };

  const options = (label: string) =>
    [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(label))!
      .querySelectorAll('option');
  const stat = (label: string) =>
    [...el.querySelectorAll('.stat')]
      .find((s) => s.querySelector('span')?.textContent?.trim() === label)
      ?.querySelector('strong')
      ?.textContent?.trim();
  const rows = () => [...el.querySelectorAll('tbody tr')];

  beforeEach(() => {
    vi.clearAllMocks();
    isAdmin.set(false);
  });

  it("shows a trainer only the mentorships they lead, with the group's figures", async () => {
    await render();
    expect([...options('Mentoría')].map((o) => o.textContent?.trim())).toEqual(['Grupo plata']);
    expect(service.members).toHaveBeenCalledWith('m2');
    expect(stat('Practicaron')).toBe('1 / 2');
    expect(stat('Sesiones')).toBe('3');
    expect(stat('P/L promedio por estudiante (USD)')).toBe('40.00');
    expect(stat('Operaciones ganadoras')).toBe('75%');
    expect(stat('Promedio en formularios')).toBe('90%');
    expect(stat('Entregas pendientes')).toBe('1');

    expect(rows().map((r) => r.querySelector('.name')?.textContent)).toEqual(['Ana', 'Luis']);
    expect(rows()[1].textContent).toContain('Sin práctica');
    expect(rows()[1].textContent).toContain('Nunca');
    expect(rows()[1].textContent).toContain('Examen de riesgo');
    expect(rows()[0].textContent).toContain('Al día');
    expect(rows()[0].querySelector('a')?.getAttribute('href')).toBe('/admin/practice?student=ana');

    const card = el.querySelector('.delivery')!;
    expect(card.textContent).toContain('1 de 2 entregaron');
    expect(card.textContent).toContain('Faltan: Luis');
    expect(card.querySelector('a')?.getAttribute('href')).toBe('/admin/forms/f1');
  });

  it('filters the students without practice or with pending work', async () => {
    await render();
    const select = el.querySelectorAll('select')[2] as HTMLSelectElement;
    select.value = 'idle';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(rows().map((r) => r.querySelector('.name')?.textContent)).toEqual(['Luis']);
  });

  it('reloads for another period', async () => {
    await render();
    const select = el.querySelectorAll('select')[1] as HTMLSelectElement;
    select.value = 'month';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const from = service.activity.mock.calls.at(-1)![1];
    expect(from.getHours()).toBe(0);
    expect(service.members).toHaveBeenCalledTimes(2);
  });

  it('shows admins every mentorship, the ones they lead first', async () => {
    isAdmin.set(true);
    await render();
    expect([...options('Mentoría')].map((o) => o.textContent?.trim())).toEqual([
      'Grupo plata',
      'Grupo oro',
    ]);
  });

  it('tells a trainer without mentorships how to get one', async () => {
    mentorships.all.mockResolvedValueOnce([mentorship('m1', 'Grupo oro', ['other'])]);
    await render();
    expect(el.textContent).toContain('Aún no lideras ninguna mentoría');
    expect(service.members).not.toHaveBeenCalled();
  });
});
