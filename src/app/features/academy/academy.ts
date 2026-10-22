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
        <a routerLink="/repository" class="btn">Ver material de estudio</a>
      } @else {
        <p>Tu inscripción está pendiente. Cuando el equipo de INDAB la active, verás aquí tus cursos.</p>
      }
    </section>
  `,
  styleUrl: '../placeholder.scss',
})
export class Academy {
  protected readonly auth = inject(AuthService);
}
