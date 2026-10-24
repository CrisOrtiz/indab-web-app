import { Injectable, signal } from '@angular/core';

/**
 * Which section of the landing page is on screen, so the header can underline its link
 * (`Nosotros`, `Contáctanos`) while the visitor scrolls. The landing sets it; it is null on any
 * other page and above the first section.
 */
@Injectable({ providedIn: 'root' })
export class LandingSections {
  readonly current = signal<string | null>(null);

  /**
   * Scrolls to a landing section if it is on the page. Sections leave room for the sticky header
   * with `scroll-margin-top`, and `html { scroll-behavior }` makes it smooth unless the visitor
   * asked for reduced motion.
   */
  scrollTo(id: string): boolean {
    const section = typeof document === 'undefined' ? null : document.getElementById(id);
    section?.scrollIntoView({ block: 'start' });
    return !!section;
  }

  /**
   * The section under a line 35% down the viewport: the last one whose top has passed it. The
   * call-to-action band and footer below the contact section count as contact.
   */
  static sectionAt(sections: readonly HTMLElement[], viewportHeight: number): string | null {
    const line = viewportHeight * 0.35;
    let current: string | null = null;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) {
        current = section.id;
      }
    }
    return current;
  }
}
