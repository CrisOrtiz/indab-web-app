import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Material } from '../../core/models/material';
import { MaterialService } from './material.service';
import { MaterialView } from './material-view';

const deck = {
  id: 'm1',
  title: 'Plan de trading',
  description: 'Paso 1\nPaso 2',
  kind: 'presentation',
  url: 'https://docs.google.com/presentation/d/1SlideDeckId_x/edit',
  category: 'Gestión de riesgo',
  published: true,
  createdAt: { toDate: () => new Date(2026, 10, 2) },
} as unknown as Material;

describe('MaterialView', () => {
  let fixture: ComponentFixture<MaterialView>;
  let el: HTMLElement;
  const service = { get: vi.fn() };

  const render = async (id = 'm1') => {
    TestBed.configureTestingModule({
      imports: [MaterialView],
      providers: [provideRouter([]), { provide: MaterialService, useValue: service }],
    });
    fixture = TestBed.createComponent(MaterialView);
    fixture.componentRef.setInput('id', id);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };

  beforeEach(() => vi.clearAllMocks());

  it('shows a presentation inside the page with a link to open it on Google Slides', async () => {
    service.get.mockResolvedValue(deck);
    await render();
    expect(service.get).toHaveBeenCalledWith('m1');
    expect(el.querySelector('h1')?.textContent).toContain('Plan de trading');
    expect(el.textContent).toContain('Gestión de riesgo');
    const frame = el.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe(
      'https://docs.google.com/presentation/d/1SlideDeckId_x/embed',
    );
    expect(frame.getAttribute('title')).toBe('Material: Plan de trading');
    const open = el.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
    expect(open.textContent).toContain('Abrir en Google Slides');
    expect(open.href).toBe(deck.url);
    expect(open.rel).toContain('noopener');
    expect(el.querySelector('.description')?.textContent).toBe('Paso 1\nPaso 2');
    expect(el.textContent).toContain('Agregado el');
  });

  it('opens other links in a new tab instead of a frame', async () => {
    service.get.mockResolvedValue({
      ...deck,
      kind: 'document',
      url: 'https://example.com/guia.pdf',
    });
    await render();
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.textContent).toContain('Este material se abre en otra página.');
    expect(el.querySelector('a[target="_blank"]')?.textContent).toContain('Abrir el PDF');
  });

  it('says when the material is missing or not for the student', async () => {
    service.get.mockResolvedValue(null);
    await render('gone');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Este material no existe o ya no está disponible para ti.',
    );
  });
});
