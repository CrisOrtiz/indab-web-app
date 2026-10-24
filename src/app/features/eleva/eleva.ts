import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';

// Placeholder: the public Eleva Inversiones section is built later.
@Component({
  selector: 'app-eleva',
  template: `
    <section class="container">
      <h1>{{ i18n.messages().eleva.title }}</h1>
      <p>{{ i18n.messages().eleva.soon }}</p>
    </section>
  `,
  styleUrl: '../placeholder.scss',
})
export class Eleva {
  protected readonly i18n = inject(I18n);
}
