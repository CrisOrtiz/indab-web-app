import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LandingSections } from '../../shared/layout/landing-sections';
import { Reveal } from '../../shared/reveal/reveal';

// Public landing page. Draft: its copy (`landing` in core/i18n/messages) is placeholder content
// for Cris to review.
@Component({
  selector: 'app-landing',
  imports: [RouterLink, Reveal],
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
      const fragment = route.snapshot.fragment;
      if (fragment) {
        this.landingSections.scrollTo(fragment);
      }
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
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
}
