import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';

// Placeholder: the learning-material repository is built in its own module later.
// It lives inside the academy area (/academy/material), not in the main navigation.
@Component({
  selector: 'app-repository',
  imports: [RouterLink],
  template: `
    <section class="container">
      <a routerLink="/academy" class="back">{{ i18n.messages().academy.back }}</a>
      <h1>{{ i18n.messages().material.title }}</h1>
      <p>{{ i18n.messages().material.soon }}</p>
    </section>
  `,
  styleUrl: '../placeholder.scss',
  styles: `
    .back {
      display: inline-block;
      margin-bottom: 16px;
      color: var(--color-muted);
    }
  `,
})
export class Repository {
  protected readonly i18n = inject(I18n);
}
