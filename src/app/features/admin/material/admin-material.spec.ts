import { signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Material } from '../../../core/models/material';
import { EvaluationService } from '../../evaluations/evaluation.service';
import { MentorshipService } from '../../mentorships/mentorship.service';
import { MaterialService } from '../../repository/material.service';
import { AdminMaterial, MaterialForm, materialProblem } from './admin-material';

const video = {
  id: 'v1',
  title: 'Clase de soportes',
  description: 'Primera clase',
  kind: 'video',
  url: 'https://youtu.be/dQw4w9WgXcQ',
  category: 'Análisis técnico',
  audience: 'all',
  studentIds: [],
  mentorshipIds: [],
  published: true,
} as unknown as Material;
const draft = {
  ...video,
  id: 'd1',
  title: 'Plan de trading',
  kind: 'presentation',
  url: 'https://docs.google.com/presentation/d/1SlideDeckId_x/edit',
  audience: 'selected',
  studentIds: ['jose'],
  mentorshipIds: ['g1'],
  published: false,
} as unknown as Material;

describe('materialProblem', () => {
  const form = (extra: Partial<MaterialForm>): MaterialForm => ({
    url: 'https://youtu.be/dQw4w9WgXcQ',
    title: 'Clase',
    description: '',
    kind: 'video',
    category: '',
    audience: 'all',
    studentIds: [],
    mentorshipIds: [],
    published: true,
    ...extra,
  });

  it('asks for an https link, a title and an audience', () => {
    expect(materialProblem(form({}))).toBeNull();
    expect(materialProblem(form({ url: 'http://x.co/a' }))).toBe('badUrl');
    expect(materialProblem(form({ url: `https://x.co/${'a'.repeat(1000)}` }))).toBe('badUrl');
    expect(materialProblem(form({ title: ' ' }))).toBe('titleRequired');
    expect(materialProblem(form({ audience: 'selected' }))).toBe('audienceRequired');
    expect(materialProblem(form({ audience: 'selected', mentorshipIds: ['g1'] }))).toBeNull();
  });
});

describe('AdminMaterial', () => {
  let fixture: ComponentFixture<AdminMaterial>;
  let el: HTMLElement;
  const service = {
    all: vi.fn(),
    create: vi.fn(async () => 'new'),
    update: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
  const directory = {
    students: vi.fn(async () => [
      { uid: 'ana', name: 'Ana Gómez', email: 'ana@x.co', academy: true, mentorshipIds: ['g1'] },
      { uid: 'jose', name: 'José Pérez', email: 'jose@x.co', academy: true, mentorshipIds: [] },
    ]),
  };
  const mentorships = {
    all: vi.fn(async () => [
      { id: 'g1', name: 'Grupo oro', mentorIds: [], active: true, description: '' },
    ]),
  };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [AdminMaterial],
      providers: [
        provideRouter([]),
        { provide: MaterialService, useValue: service },
        { provide: EvaluationService, useValue: directory },
        { provide: MentorshipService, useValue: mentorships },
        {
          provide: AuthService,
          useValue: { isStaff: signal(true), user: signal(null), profile: signal(null) },
        },
      ],
    });
    fixture = TestBed.createComponent(AdminMaterial);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };
  const button = (name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === name,
    );
  const field = (label: string) =>
    [...el.querySelectorAll('label')]
      .find((l) => l.firstChild?.textContent?.trim() === label)!
      .querySelector<HTMLInputElement & HTMLSelectElement>('input, select, textarea')!;
  const type = async (label: string, value: string) => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  const menuItem = async (title: string, action: string) => {
    el.querySelector<HTMLButtonElement>(`[aria-label="Acciones: ${title}"]`)!.click();
    await fixture.whenStable();
    return [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (i) => i.textContent?.trim() === action,
    )!;
  };
  const cards = () =>
    [...el.querySelectorAll('.material-cards .card h3')].map((h) => h.textContent);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    service.all.mockResolvedValue([video, draft]);
  });

  it('lists the material with its status, audience and totals', async () => {
    await render();
    expect(cards()).toEqual([
      expect.stringContaining('Clase de soportes'),
      expect.stringContaining('Plan de trading'),
    ]);
    expect(el.textContent).toContain('Publicado');
    expect(el.textContent).toContain('Borrador');
    expect(el.textContent).toContain('Para todos');
    // José by name plus Ana through Grupo oro.
    expect(el.textContent).toContain('Para 2 alumnos');
    expect([...el.querySelectorAll('.stat strong')].map((s) => s.textContent)).toEqual([
      '2',
      '1',
      '1',
    ]);
  });

  it('adds a video from its link, with a preview, the type guessed and the topic', async () => {
    await render();
    button('Nuevo material')!.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Abajo verás cómo protegerlo.');

    await type('Enlace', 'http://youtu.be/x');
    expect(el.querySelector('.hint.error')?.textContent).toContain('https://');

    await type('Enlace', 'https://docs.google.com/presentation/d/1SlideDeckId_x/edit');
    expect(el.querySelector('.hint.ok')?.textContent).toContain(
      'Google Slides: se verá dentro de la academia.',
    );
    expect(field('Tipo').value).toBe('presentation');
    // How to keep it to the academy, for this site.
    expect(el.querySelector('.protect')?.textContent).toContain('«Restringido»');
    expect(el.querySelector('.protect')?.textContent).toContain('No uses «Publicar en la web»');
    expect(el.querySelector('.preview iframe')?.getAttribute('src')).toBe(
      'https://docs.google.com/presentation/d/1SlideDeckId_x/embed',
    );

    await submit();
    expect(el.querySelector('.message.error')?.textContent).toContain('Escribe un título.');

    await type('Título', '  Plan de trading 2  ');
    await type('Tema', 'Gestión de riesgo ');
    // The topics already used are offered.
    expect([...el.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toEqual(
      ['Análisis técnico'],
    );
    await submit();
    expect(service.create).toHaveBeenCalledWith({
      url: 'https://docs.google.com/presentation/d/1SlideDeckId_x/edit',
      title: 'Plan de trading 2',
      description: '',
      kind: 'presentation',
      category: 'Gestión de riesgo',
      audience: 'all',
      studentIds: [],
      mentorshipIds: [],
      published: true,
    });
    expect(el.querySelector('.message')?.textContent).toContain('Se guardó «Plan de trading 2».');
    expect(el.querySelector('form')).toBeNull();
  });

  it('asks for students or mentorships when the material is not for everyone', async () => {
    await render();
    button('Nuevo material')!.click();
    await fixture.whenStable();
    await type('Enlace', 'https://example.com/guia.pdf');
    expect(el.textContent).toContain('Este enlace se abrirá en una pestaña nueva.');
    expect(field('Tipo').value).toBe('document');
    await type('Título', 'Guía');
    const selected = [...el.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1];
    selected.click();
    await fixture.whenStable();
    await submit();
    expect(el.querySelector('.message.error')?.textContent).toContain(
      'Elige al menos una mentoría o un alumno.',
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('edits, hides and deletes from the card menu', async () => {
    await render();
    (await menuItem('Plan de trading', 'Editar')).click();
    await fixture.whenStable();
    expect(el.querySelector('h2')?.textContent).toContain('Editar material');
    expect(field('Título').value).toBe('Plan de trading');
    await submit();
    expect(service.update).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ studentIds: ['jose'], mentorshipIds: ['g1'], published: false }),
    );

    (await menuItem('Clase de soportes', 'Pasar a borrador')).click();
    await fixture.whenStable();
    expect(service.update).toHaveBeenCalledWith('v1', { published: false });
    expect(el.textContent).toContain('«Clase de soportes» volvió a borrador.');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (await menuItem('Clase de soportes', 'Eliminar')).click();
    await fixture.whenStable();
    expect(service.remove).toHaveBeenCalledWith('v1');
    expect(cards()).toHaveLength(1);
  });

  it('links each card to the student view', async () => {
    await render();
    const view = await menuItem('Clase de soportes', 'Ver como alumno');
    expect(view.getAttribute('href')).toBe('/academy/material/v1');
  });
});
