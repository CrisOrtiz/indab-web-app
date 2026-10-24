import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';

// Placeholder: the academy area is built in its own module later.
@Component({
  selector: 'app-academy',
  imports: [RouterLink],
  template: `
    @let t = i18n.messages().academy;
    <section class="container">
      <h1>{{ t.hello(auth.profile()?.displayName || auth.user()?.email || '') }}</h1>
      @if (auth.hasAcademyAccess()) {
        <p>{{ t.welcome }}</p>
        <div class="actions">
          <a routerLink="/academy/material" class="btn">{{ t.material }}</a>
          <a routerLink="/academy/practice" class="btn btn-outline">{{ t.practice }}</a>
        </div>
      } @else {
        <p>{{ t.pending }}</p>
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
  protected readonly i18n = inject(I18n);
}
