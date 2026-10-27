import {
  Component,
  DestroyRef,
  ElementRef,
  afterEveryRender,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { NotificationBell } from '../../features/notifications/notification-bell';
import { Avatar } from '../avatar/avatar';
import { Icon } from '../icon/icon';
import { LanguageSwitcher } from '../language/language-switcher';
import { LandingSections } from './landing-sections';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, Avatar, Icon, LanguageSwitcher, NotificationBell],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(document:keydown.escape)': 'closeMenu()',
    '[class.scrolled]': 'scrolled()',
  },
})
export class Header {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly landingSections = inject(LandingSections);

  /** Links to sections of the landing page; their ids stay Spanish in every language. */
  protected readonly sectionLinks = computed(() => {
    const t = this.i18n.messages().header;
    return [
      { id: 'nosotros', label: t.about },
      { id: 'contacto', label: t.contact },
    ];
  });
  /** The landing section on screen, underlined like the current page. */
  protected readonly currentSection = this.landingSections.current;

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
  /** Set once the page is scrolled: the sticky header gets thinner and casts a shadow. */
  protected readonly scrolled = signal(false);
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.closeMenu();
      }
    });

    // Browser only: neither callback runs while prerendering.
    afterEveryRender(() => this.placeIndicator());
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // Different thresholds on and off, so the header shrinking near the top (which shortens
      // the page) cannot flip it back and forth.
      const onScroll = () =>
        this.scrolled.set(this.scrolled() ? window.scrollY > 8 : window.scrollY > 32);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      // Link widths change when the web font arrives or the window is resized.
      // The header's height is published as `--header-height`, so anchored sections stop below it.
      const resize =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(() => {
              this.placeIndicator();
              document.documentElement.style.setProperty(
                '--header-height',
                `${this.host.nativeElement.offsetHeight}px`,
              );
            });
      resize?.observe(this.nav().nativeElement);
      resize?.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScroll);
        resize?.disconnect();
      });
    });
  }

  /**
   * Moves the underline under the link of the current section; CSS slides it from the previous
   * one. It shows once it has a place, so it does not slide in from the left on the first page.
   */
  private placeIndicator(): void {
    const nav = this.nav().nativeElement;
    const active = nav.querySelector<HTMLElement>('a.active');
    nav.classList.toggle('has-active', !!active);
    if (active) {
      nav.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
      nav.style.setProperty('--indicator-width', `${active.offsetWidth}px`);
      requestAnimationFrame(() => nav.classList.add('indicator-ready'));
    }
  }

  /**
   * On the landing the link only scrolls (the router skips a fragment that is already in the URL);
   * from other pages the router opens the landing and it scrolls there itself.
   */
  protected goToSection(id: string): void {
    this.landingSections.scrollTo(id);
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
