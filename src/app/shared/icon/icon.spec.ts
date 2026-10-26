import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ICONS, Icon } from './icon';

@Component({
  imports: [Icon],
  template: `<button type="button" aria-label="Duplicar">
    <app-icon name="copy" [size]="20" />
  </button>`,
})
class Host {}

describe('Icon', () => {
  it('draws the named icon, hidden from assistive technology', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const svg = fixture.nativeElement.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('20');
    expect([...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual(ICONS.copy);
  });
});
