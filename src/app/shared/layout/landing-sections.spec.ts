import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LandingSections } from './landing-sections';

describe('LandingSections', () => {
  const section = (id: string, top: number) => {
    const el = document.createElement('section');
    el.id = id;
    el.getBoundingClientRect = () => ({ top }) as DOMRect;
    return el;
  };

  it('picks the last section whose top passed 35% of the viewport', () => {
    const at = (tops: number[]) =>
      LandingSections.sectionAt(
        tops.map((top, i) => section(['nosotros', 'programas', 'contacto'][i], top)),
        1000,
      );
    expect(at([500, 1500, 2500])).toBeNull();
    expect(at([350, 1350, 2350])).toBe('nosotros');
    expect(at([-800, 200, 1200])).toBe('programas');
    // Past the contact section (call to action, footer) it stays on contact.
    expect(at([-3000, -2000, -900])).toBe('contacto');
  });

  it('scrolls to a section on the page and says when there is none', () => {
    const sections = TestBed.inject(LandingSections);
    const target = section('contacto', 0);
    target.scrollIntoView = vi.fn();
    document.body.append(target);
    expect(sections.scrollTo('contacto')).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    target.remove();
    expect(sections.scrollTo('contacto')).toBe(false);
  });
});
