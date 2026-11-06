import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Review } from '../../core/models/review';
import { ReviewPanel } from './review-panel';
import { quietReviews } from './testing';

describe('ReviewPanel', () => {
  const auth = {
    whenReady: async () => undefined,
    user: signal<{ uid: string; displayName: string | null; photoURL: string | null } | null>({
      uid: 'ana',
      displayName: 'Ana Pérez',
      photoURL: null,
    }),
    profile: signal<{ displayName: string; photoURL?: string } | null>({
      displayName: 'Ana Pérez',
    }),
  };
  const saved = {
    id: 'ana',
    name: 'Ana P.',
    photoURL: null,
    rating: 4,
    text: 'Aprendí a operar con un plan y gestión de riesgo.',
    featured: true,
  } as unknown as Review;

  const render = async (mine: Review | null = null) => {
    const quiet = quietReviews(mine);
    const save = vi.spyOn(quiet.reviews, 'save');
    const remove = vi.spyOn(quiet.reviews, 'remove');
    TestBed.configureTestingModule({
      imports: [ReviewPanel],
      providers: [...quiet.providers, { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(ReviewPanel);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { el, save, remove, quiet, stable: () => fixture.whenStable() };
  };

  const type = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };
  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

  beforeEach(() => {
    auth.profile.set({ displayName: 'Ana Pérez' });
  });

  it('starts a review with the profile name and checks it before sending', async () => {
    const { el, save, stable } = await render();
    expect(el.querySelector('h2')?.textContent).toBe('Tu reseña de INDAB');
    expect(el.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Ana Pérez');
    expect(el.querySelector('.state')).toBeNull();
    expect(el.querySelector('input[type="checkbox"]')).toBeNull();

    button(el, 'Enviar reseña').click();
    await stable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Elige de 1 a 5 estrellas.');

    el.querySelector<HTMLInputElement>('input[aria-label="5 estrellas"]')!.click();
    type(el.querySelector('textarea')!, 'Muy bueno');
    button(el, 'Enviar reseña').click();
    await stable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('al menos 20 caracteres');
    expect(save).not.toHaveBeenCalled();

    type(el.querySelector('textarea')!, 'La mentoría me ayudó a operar con un plan.');
    await stable();
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('42 / 600');
    button(el, 'Enviar reseña').click();
    await stable();
    expect(save).toHaveBeenCalledWith(
      'ana',
      {
        name: 'Ana Pérez',
        text: 'La mentoría me ayudó a operar con un plan.',
        rating: 5,
        photoURL: null,
      },
      false,
    );
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Reseña enviada.');
  });

  it('shares the profile photo only while the box is ticked', async () => {
    auth.profile.set({ displayName: 'Ana Pérez', photoURL: 'data:image/jpeg;base64,AAAA' });
    const { el, save, stable } = await render({
      ...saved,
      featured: false,
      photoURL: 'x',
    } as Review);
    const box = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(true);
    button(el, 'Guardar cambios').click();
    await stable();
    expect(save.mock.calls[0][1]).toMatchObject({ photoURL: 'data:image/jpeg;base64,AAAA' });
    box.click();
    button(el, 'Guardar cambios').click();
    await stable();
    expect(save.mock.calls[1][1]).toMatchObject({ photoURL: null });
    expect(save.mock.calls[1][2]).toBe(true);
  });

  it('shows whether the review is on the landing and lets the author delete it', async () => {
    const { el, remove, stable } = await render(saved);
    expect(el.querySelector('.state')?.textContent).toContain('se muestra en la página de inicio');
    expect(el.querySelector('textarea')?.value).toBe(saved.text);
    expect(el.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Ana P.');
    expect(el.querySelector<HTMLInputElement>('input[aria-label="4 estrellas"]')?.checked).toBe(
      true,
    );
    expect(el.textContent).toContain('Si la editas, deja de mostrarse');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    button(el, 'Eliminar reseña').click();
    await stable();
    expect(remove).toHaveBeenCalledWith('ana');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Reseña eliminada.');
    expect(el.querySelector('textarea')?.value).toBe('');
    expect(button(el, 'Enviar reseña')).toBeTruthy();
  });
});
