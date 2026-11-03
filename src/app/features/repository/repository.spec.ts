import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Material } from '../../core/models/material';
import { MaterialService } from './material.service';
import { Repository } from './repository';

const item = (id: string, extra: Partial<Material>): Material =>
  ({
    id,
    title: id,
    description: '',
    kind: 'video',
    url: 'https://example.com',
    category: '',
    audience: 'all',
    studentIds: [],
    mentorshipIds: [],
    published: true,
    createdAt: { toMillis: () => 0 },
    ...extra,
  }) as Material;

describe('Repository', () => {
  let fixture: ComponentFixture<Repository>;
  let el: HTMLElement;
  const service = { visible: vi.fn() };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [Repository],
      providers: [provideRouter([]), { provide: MaterialService, useValue: service }],
    });
    fixture = TestBed.createComponent(Repository);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };
  const titles = () => [...el.querySelectorAll('.item h3')].map((h) => h.textContent?.trim());
  const headings = () => [...el.querySelectorAll('.group h2')].map((h) => h.textContent?.trim());
  const chip = (name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('.chips button')].find(
      (b) => b.textContent?.trim() === name,
    )!;

  beforeEach(() => {
    vi.clearAllMocks();
    service.visible.mockResolvedValue([
      item('Clase de soportes', {
        url: 'https://youtu.be/dQw4w9WgXcQ',
        category: 'Análisis técnico',
        description: 'Primera clase',
      }),
      item('Plan de trading', { kind: 'presentation', category: 'Gestión de riesgo' }),
      item('Glosario', { kind: 'document' }),
    ]);
  });

  it('groups the material by topic and links each piece to its page', async () => {
    await render();
    expect(headings()).toEqual(['Análisis técnico', 'Gestión de riesgo', 'Otros']);
    expect(titles()).toEqual(['Clase de soportes', 'Plan de trading', 'Glosario']);
    expect(el.querySelector('a.item')?.getAttribute('href')).toBe(
      '/academy/material/Clase%20de%20soportes',
    );
    // YouTube videos show YouTube's preview picture.
    expect(el.querySelector('.item img')?.getAttribute('src')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    expect(el.textContent).toContain('3 materiales');
  });

  it('filters by type, topic and search', async () => {
    await render();
    chip('Presentaciones').click();
    await fixture.whenStable();
    expect(titles()).toEqual(['Plan de trading']);
    expect(chip('Presentaciones').getAttribute('aria-pressed')).toBe('true');

    chip('Todo').click();
    const topic = el.querySelector<HTMLSelectElement>('select')!;
    topic.value = 'Análisis técnico';
    topic.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(titles()).toEqual(['Clase de soportes']);

    topic.value = '';
    topic.dispatchEvent(new Event('change'));
    const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.textContent).toContain('Nada coincide con la búsqueda.');
    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Limpiar filtros')!
      .click();
    await fixture.whenStable();
    expect(titles()).toHaveLength(3);
  });

  it('says when there is no material yet, or when it could not load', async () => {
    service.visible.mockResolvedValue([]);
    await render();
    expect(el.textContent).toContain('Todavía no hay material para ti');
    expect(el.querySelector('.filters')).toBeNull();

    TestBed.resetTestingModule();
    service.visible.mockRejectedValue(new Error('offline'));
    await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo cargar el material',
    );
  });
});
