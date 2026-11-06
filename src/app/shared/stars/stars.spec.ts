import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
import { Stars } from './stars';

@Component({
  imports: [Stars],
  template: `<app-stars [value]="value()" [size]="20" />`,
})
class Host {
  readonly value = signal(4);
}

describe('Stars', () => {
  it('fills as many stars as the rating and reads it out', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const stars = fixture.nativeElement.querySelector('app-stars') as HTMLElement;
    expect(stars.getAttribute('role')).toBe('img');
    expect(stars.getAttribute('aria-label')).toBe('4 de 5 estrellas');
    expect(stars.querySelectorAll('path').length).toBe(5);
    expect(stars.querySelectorAll('path.on').length).toBe(4);
    expect(stars.querySelector('svg')?.getAttribute('width')).toBe('20');

    fixture.componentInstance.value.set(1);
    await TestBed.inject(I18n).use('en-US');
    await fixture.whenStable();
    expect(stars.querySelectorAll('path.on').length).toBe(1);
    expect(stars.getAttribute('aria-label')).toBe('1 out of 5 stars');
  });
});
