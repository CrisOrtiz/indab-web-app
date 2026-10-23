import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

// Placeholder: the academy area is built in its own module later.
@Component({
  selector: 'app-academy',
  imports: [RouterLink],
  template: `
    <section class="container">
      <h1>Hola, {{ auth.profile()?.displayName || auth.user()?.email }}</h1>
      @if (auth.hasAcademyAccess()) {
        <p>Bienvenido a la academia.</p>
        <div class="actions">
          <a routerLink="/academy/material" class="btn">Ver material de estudio</a>
          <a routerLink="/academy/practice" class="btn btn-outline">Práctica de trading</a>
        </div>
      } @else {
        <p>
          Tu inscripción está pendiente. Cuando el equipo de INDAB la active, verás aquí tus cursos.
        </p>
      }
    </section>
  `,
  styleUrl: '../placeholder.scss',
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
  `,
})
export class Academy {
  protected readonly auth = inject(AuthService);
}
