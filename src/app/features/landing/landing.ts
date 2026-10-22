import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

// Placeholder: the public landing page is built in its own module later.
@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  template: `
    <section class="container">
      <h1>INDAB Academy</h1>
      <p>Conocimiento. Disciplina. Estrategia. Resultados.</p>
      <a routerLink="/register" class="btn">Únete a la academia</a>
    </section>
  `,
  styleUrl: '../placeholder.scss',
})
export class Landing {}
