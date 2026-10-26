import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { Reveal } from '../../shared/reveal/reveal';

type AdminCard = 'users' | 'exams' | 'evaluations' | 'practice';

// Admin home: a card per tool, each opening its own page.
@Component({
  selector: 'app-admin',
  imports: [NgTemplateOutlet, Reveal, RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin-home.scss',
})
export class Admin {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  /** A card per admin tool; trainers do not get the users card. */
  protected readonly cards = computed<{ key: AdminCard; link: string }[]>(() => [
    ...(this.auth.isAdmin() ? [{ key: 'users' as const, link: '/admin/users' }] : []),
    { key: 'exams', link: '/admin/forms' },
    { key: 'evaluations', link: '/admin/evaluations' },
    { key: 'practice', link: '/admin/practice' },
  ]);
}
