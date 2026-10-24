import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { Avatar } from '../avatar/avatar';
import { LanguageSwitcher } from '../language/language-switcher';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, Avatar, LanguageSwitcher],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class Header {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The uploaded photo wins over the Google one; without either, initials. */
  protected readonly photo = computed(
    () => this.auth.profile()?.photoURL || this.auth.user()?.photoURL || null,
  );
  protected readonly name = computed(
    () =>
      this.auth.profile()?.displayName ||
      this.auth.user()?.displayName ||
      this.auth.user()?.email ||
      '',
  );
  protected readonly menuOpen = signal(false);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.closeMenu();
      }
    });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected closeOnOutsideClick(event: Event): void {
    const account = this.host.nativeElement.querySelector('.account');
    if (this.menuOpen() && !account?.contains(event.target as Node)) {
      this.closeMenu();
    }
  }

  protected async signOut(): Promise<void> {
    this.closeMenu();
    await this.auth.signOut();
    await this.router.navigateByUrl('/');
  }
}
