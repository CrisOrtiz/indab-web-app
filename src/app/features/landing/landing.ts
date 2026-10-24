import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
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
  private readonly i18n = inject(I18n);
  protected readonly t = computed(() => this.i18n.messages().landing);

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
