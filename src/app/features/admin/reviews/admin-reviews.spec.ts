import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Review } from '../../../core/models/review';
import { EvaluationService } from '../../evaluations/evaluation.service';
import { quietReviews } from '../../reviews/testing';
import { AdminReviews, filterReviews } from './admin-reviews';

const at = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

const reviews = [
  {
    id: 'ana',
    name: 'Ana P.',
    photoURL: null,
    rating: 5,
    text: 'La mentoría me ayudó a operar con un plan.',
    featured: true,
    updatedAt: at(Date.UTC(2026, 10, 2)),
  },
  {
    id: 'luis',
    name: 'Luis',
    photoURL: null,
    rating: 4,
    text: 'Las prácticas en el gráfico del oro son muy útiles.',
    featured: false,
    updatedAt: at(Date.UTC(2026, 10, 1)),
  },
] as unknown as Review[];

describe('filterReviews', () => {
  it('filters by whether they are on the landing and by name, text or email', () => {
    const emails = new Map([['luis', 'luis@indab.test']]);
    expect(filterReviews(reviews, 'shown', '').map((r) => r.id)).toEqual(['ana']);
    expect(filterReviews(reviews, 'hidden', '').map((r) => r.id)).toEqual(['luis']);
    expect(filterReviews(reviews, '', 'ORO').map((r) => r.id)).toEqual(['luis']);
    expect(filterReviews(reviews, '', 'luis@', emails).map((r) => r.id)).toEqual(['luis']);
    expect(filterReviews(reviews, 'shown', 'oro')).toEqual([]);
  });
});

describe('AdminReviews', () => {
  const render = async (list = reviews) => {
    const quiet = quietReviews();
    quiet.reviews.all = async () => list;
    const setFeatured = vi.spyOn(quiet.reviews, 'setFeatured');
    const remove = vi.spyOn(quiet.reviews, 'remove');
    TestBed.configureTestingModule({
      imports: [AdminReviews],
      providers: [
        provideRouter([]),
        ...quiet.providers,
        {
          provide: EvaluationService,
          useValue: { students: async () => [{ uid: 'ana', email: 'ana@indab.test' }] },
        },
      ],
    });
    const fixture = TestBed.createComponent(AdminReviews);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { el, setFeatured, remove, stable: () => fixture.whenStable() };
  };
  const button = (scope: Element, text: string) =>
    [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

  it('lists the reviews with stats, the author email and whether they are on the landing', async () => {
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent).toBe('Reseñas');
    const stats = [...el.querySelectorAll('.stat strong')].map((s) => s.textContent);
    expect(stats).toEqual(['2', '1', '4.5']);
    const cards = el.querySelectorAll('li.card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Ana P.');
    expect(cards[0].textContent).toContain('ana@indab.test');
    expect(cards[0].querySelector('.badge')?.textContent).toBe('En la página de inicio');
    expect(cards[1].querySelector('.badge')).toBeNull();
    expect(cards[1].querySelector('app-stars')?.getAttribute('aria-label')).toBe(
      '4 de 5 estrellas',
    );
  });

  it('puts a review on the landing or takes it off', async () => {
    const { el, setFeatured, stable } = await render();
    const luis = el.querySelectorAll('li.card')[1];
    button(luis, 'Mostrar en inicio').click();
    await stable();
    expect(setFeatured).toHaveBeenCalledWith('luis', true);
    expect(el.querySelector('.message')?.textContent).toContain('La reseña de Luis ya se muestra');
    expect(el.querySelectorAll('.stat strong')[1].textContent).toBe('2');

    button(el.querySelectorAll('li.card')[0], 'Quitar de inicio').click();
    await stable();
    expect(setFeatured).toHaveBeenCalledWith('ana', false);
  });

  it('filters the list and deletes a review after confirming', async () => {
    const { el, remove, stable } = await render();
    const select = el.querySelector('select')!;
    select.value = 'hidden';
    select.dispatchEvent(new Event('change'));
    await stable();
    expect(el.querySelectorAll('li.card').length).toBe(1);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    el.querySelector<HTMLButtonElement>('app-actions-menu button')!.click();
    await stable();
    button(el.querySelector('app-actions-menu')!, 'Eliminar').click();
    await stable();
    expect(remove).toHaveBeenCalledWith('luis');
    expect(el.querySelectorAll('li.card').length).toBe(0);
    expect(el.textContent).toContain('Nada coincide con estos filtros.');
  });

  it('explains where reviews come from when there are none', async () => {
    const { el } = await render([]);
    expect(el.textContent).toContain('Los estudiantes las escriben desde su perfil.');
  });
});
