import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { Reveal } from '../../shared/reveal/reveal';

type CardKey = 'material' | 'practice' | 'exams' | 'ranking' | 'calendar';

// Academy home: a card per section. Without academy access the cards show locked.
@Component({
  selector: 'app-academy',
  imports: [NgTemplateOutlet, RouterLink, Reveal],
  templateUrl: './academy.html',
  styleUrl: './academy.scss',
})
export class Academy {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly cards: { key: CardKey; link: string }[] = [
    { key: 'material', link: '/academy/material' },
    { key: 'practice', link: '/academy/practice' },
    { key: 'exams', link: '/academy/exams' },
    { key: 'ranking', link: '/academy/ranking' },
    { key: 'calendar', link: '/academy/calendar' },
  ];

  // Decorative candles in the greeting band: wick from hi to lo, body from top.
  protected readonly heroCandles = [
    { x: 30, hi: 70, lo: 104, top: 78, height: 18, up: true },
    { x: 62, hi: 66, lo: 100, top: 72, height: 20, up: false },
    { x: 94, hi: 44, lo: 84, top: 52, height: 22, up: true },
    { x: 126, hi: 40, lo: 76, top: 48, height: 16, up: false },
    { x: 158, hi: 22, lo: 62, top: 28, height: 24, up: true },
    { x: 190, hi: 8, lo: 44, top: 14, height: 20, up: true },
  ];
}
