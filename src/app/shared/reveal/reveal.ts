import { DestroyRef, Directive, ElementRef, PLATFORM_ID, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Fades and slides an element in the first time it scrolls into view.
 * Adds `reveal` at once and `revealed` when visible; the styles live in `styles.scss`.
 * `appReveal` takes an optional delay in ms to stagger items in a list.
 */
@Directive({
  selector: '[appReveal]',
  host: {
    class: 'reveal',
    '[style.--reveal-delay]': 'delay() + "ms"',
  },
})
export class Reveal {
  readonly delay = input(0, { alias: 'appReveal', transform: (v: number | '') => Number(v) || 0 });

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    if (!isPlatformBrowser(inject(PLATFORM_ID)) || typeof IntersectionObserver === 'undefined') {
      el.classList.add('revealed');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('revealed');
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(el);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}
