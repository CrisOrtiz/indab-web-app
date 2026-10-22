import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="container">
      <h1>Página no encontrada</h1>
      <a routerLink="/" class="btn btn-outline">Volver al inicio</a>
    </section>
  `,
  styleUrl: '../placeholder.scss',
})
export class NotFound {}
