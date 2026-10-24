import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="container">
      <h1>{{ i18n.messages().notFound.title }}</h1>
      <a routerLink="/" class="btn btn-outline">{{ i18n.messages().notFound.home }}</a>
    </section>
  `,
  styleUrl: '../placeholder.scss',
})
export class NotFound {
  protected readonly i18n = inject(I18n);
}
