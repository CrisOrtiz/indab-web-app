import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { DEFAULT_SETTINGS, NotificationSettings } from '../../core/models/notification';
import { EvaluationService } from '../evaluations/evaluation.service';
import { ExamService } from '../exams/exam.service';
import { MentorshipService } from '../mentorships/mentorship.service';
import { NotificationSettingsPanel } from './notification-settings';
import { NotificationService } from './notification.service';

describe('NotificationSettingsPanel', () => {
  let fixture: ComponentFixture<NotificationSettingsPanel>;
  let el: HTMLElement;
  const service = {
    settings: vi.fn(async (): Promise<NotificationSettings> => ({ ...DEFAULT_SETTINGS })),
    saveSettings: vi.fn(async () => undefined),
  };
  const evaluations = {
    students: vi.fn(async () => [
      { uid: 'ana', name: 'Ana Pérez', email: '', academy: true, mentorshipIds: [] },
      { uid: 'luis', name: 'Luis Díaz', email: '', academy: true, mentorshipIds: [] },
    ]),
    all: vi.fn(async () => [{ id: 'e1', title: 'Final de oro' }]),
  };
  const exams = { all: vi.fn(async () => [{ id: 'x1', title: 'Examen 1' }]) };
  const mentorships = {
    all: vi.fn(async () => [
      { id: 'm1', name: 'Grupo oro', mentorIds: ['coach'] },
      { id: 'm2', name: 'Grupo índices', mentorIds: [] },
    ]),
  };

  const render = async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: 'coach' }) } },
        { provide: NotificationService, useValue: service },
        { provide: EvaluationService, useValue: evaluations },
        { provide: ExamService, useValue: exams },
        { provide: MentorshipService, useValue: mentorships },
      ],
    });
    fixture = TestBed.createComponent(NotificationSettingsPanel);
    el = fixture.nativeElement;
    await fixture.whenStable();
    await fixture.whenStable();
  };
  const check = (label: string) =>
    [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(label))!
      .querySelector('input')!;
  const saveButton = () =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Guardar preferencias'),
    )!;

  beforeEach(() => {
    vi.clearAllMocks();
    service.settings.mockResolvedValue({ ...DEFAULT_SETTINGS });
  });

  it('starts following nothing, with every kind of activity ticked', async () => {
    await render();
    expect(service.settings).toHaveBeenCalledWith('coach');
    expect(check('terminó una práctica libre').checked).toBe(true);
    expect(check('Todos los estudiantes').checked).toBe(false);
    expect(el.textContent).toContain('Aún no sigues nada');
    expect(el.textContent).toContain('Eres mentor');
    expect(saveButton().disabled).toBe(true);
  });

  it('saves what the mentor picks, against what was saved before', async () => {
    await render();
    check('Grupo oro').click();
    check('Final de oro').click();
    check('Examen 1').click();
    check('entregó un formulario').click();
    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = 'luis';
    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Seguir')!
      .click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Luis Díaz');
    expect(el.textContent).not.toContain('Aún no sigues nada');
    saveButton().click();
    await fixture.whenStable();
    expect(service.saveSettings).toHaveBeenCalledWith(
      'coach',
      {
        ...DEFAULT_SETTINGS,
        types: ['practiceFinished', 'evaluationFinished'],
        studentIds: ['luis'],
        mentorshipIds: ['m1'],
        evaluationIds: ['e1'],
        examIds: ['x1'],
      },
      DEFAULT_SETTINGS,
    );
    expect(el.textContent).toContain('Preferencias guardadas.');
  });

  it('shows what was saved and warns about following everyone', async () => {
    service.settings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      studentIds: ['ana'],
      types: [],
    });
    await render();
    expect(el.querySelector('.chips')?.textContent).toContain('Ana Pérez');
    expect(el.textContent).toContain('No marcaste ningún tipo de aviso');
    check('Todos los estudiantes').click();
    await fixture.whenStable();
    expect(el.textContent).toContain('pueden ser muchos avisos');
    el.querySelector<HTMLButtonElement>('[aria-label="Dejar de seguir a Ana Pérez"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.chips')).toBeNull();
  });

  it('says when saving fails', async () => {
    service.saveSettings.mockRejectedValueOnce(new Error('denied'));
    await render();
    check('Todos los estudiantes').click();
    await fixture.whenStable();
    saveButton().click();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudieron guardar tus preferencias.',
    );
  });
});
