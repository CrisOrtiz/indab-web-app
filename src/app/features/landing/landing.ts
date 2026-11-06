import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import type { Review } from '../../core/models/review';
import { Avatar } from '../../shared/avatar/avatar';
import { LandingSections } from '../../shared/layout/landing-sections';
import { Reveal } from '../../shared/reveal/reveal';
import { SocialLinks } from '../../shared/social/social-links';
import { Stars } from '../../shared/stars/stars';
import { FEATURED_REVIEWS } from '../reviews/featured-reviews-loader';

// Public landing page. Draft: its copy (`landing` in core/i18n/messages) is placeholder content
// for Cris to review. The testimonials are students' reviews that admins picked
// (`/admin/reviews`), read in the browser once the visitor scrolls near them; the section is
// left out while there are none.
@Component({
  selector: 'app-landing',
  imports: [RouterLink, Avatar, Reveal, SocialLinks, Stars],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  protected readonly auth = inject(AuthService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly host = () => this.elementRef.nativeElement;
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.messages().landing);
  protected readonly landingSections = inject(LandingSections);
  private readonly featuredReviews = inject(FEATURED_REVIEWS);

  /** Reviews picked for the landing; empty until loaded (and on the prerendered page). */
  protected readonly reviews = signal<Review[]>([]);
  private readonly reviewsAnchor = viewChild<ElementRef<HTMLElement>>('reviewsAnchor');

  constructor() {
    const route = inject(ActivatedRoute);
    const destroyRef = inject(DestroyRef);
    // Browser only: tracks the section on screen for the header and the section menu, and
    // scrolls to `/#contacto` style links once the page is drawn (also when coming from another
    // page through the header).
    afterNextRender(() => {
      const host = this.host();
      const sections = [...host.querySelectorAll<HTMLElement>('section[id]')];
      let frame = 0;
      const update = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() =>
          this.landingSections.current.set(LandingSections.sectionAt(sections, innerHeight)),
        );
      };
      update();
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update, { passive: true });
      const stopReviews = this.whenNear(this.reviewsAnchor()?.nativeElement, () =>
        this.loadReviews(),
      );
      const fragment = route.snapshot.fragment;
      if (fragment) {
        this.landingSections.scrollTo(fragment);
      }
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        stopReviews();
        window.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
        this.landingSections.current.set(null);
      });
    });
  }

  /** Anchors keep their Spanish ids in every language, so shared links keep working. */
  protected readonly sections = computed(() => {
    const label = this.t().sections;
    return [
      { id: 'nosotros', label: label.about },
      { id: 'programas', label: label.programs },
      { id: 'metodologia', label: label.method },
      { id: 'plataforma', label: label.platform },
      { id: 'eleva', label: label.eleva },
      { id: 'preguntas', label: label.faq },
      { id: 'contacto', label: label.contact },
    ];
  });

  /** Runs `load` once when `el` comes within a screen or so of the viewport. */
  private whenNear(el: HTMLElement | undefined, load: () => void): () => void {
    if (!el || typeof IntersectionObserver === 'undefined') {
      load();
      return () => undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }

  /** Loads the Firestore SDK and the picked reviews; the section stays out if this fails. */
  private async loadReviews(): Promise<void> {
    try {
      this.reviews.set(await this.featuredReviews());
    } catch {
      this.reviews.set([]);
    }
  }
}
