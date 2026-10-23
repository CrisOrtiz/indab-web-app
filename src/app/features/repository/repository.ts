import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

// Placeholder: the learning-material repository is built in its own module later.
// It lives inside the academy area (/academy/material), not in the main navigation.
@Component({
  selector: 'app-repository',
  imports: [RouterLink],
  template: `
    <section class="container">
      <a routerLink="/academy" class="back">← Academia</a>
      <h1>Material de estudio</h1>
      <p>Aquí estará el repositorio de material de la academia.</p>
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
export class Repository {}
