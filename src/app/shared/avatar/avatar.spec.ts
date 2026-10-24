import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Avatar, initials } from './avatar';

describe('initials', () => {
  it('takes the first and last word of a name', () => {
    expect(initials('María Fernández')).toBe('MF');
    expect(initials('ana maría de la cruz')).toBe('AC');
    expect(initials('Ana')).toBe('A');
  });

  it('uses the part of an email before the @', () => {
    expect(initials('juan.perez@indab.co')).toBe('JP');
    expect(initials('ana@indab.co')).toBe('A');
  });

  it('falls back to a question mark', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});

describe('Avatar', () => {
  @Component({
    imports: [Avatar],
    template: `<app-avatar [photo]="photo()" [name]="name()" [size]="48" />`,
  })
  class Host {
    readonly photo = signal<string | null>(null);
    readonly name = signal('María Fernández');
  }

  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('shows the initials without a photo', async () => {
    const { el } = await render();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent?.trim()).toBe('MF');
    expect(el.querySelector<HTMLElement>('app-avatar')!.style.width).toBe('48px');
  });

  it('shows the photo, and the initials if it fails to load', async () => {
    const { fixture, el } = await render();
    fixture.componentInstance.photo.set('data:image/png;base64,AAAA');
    await fixture.whenStable();
    const img = el.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');

    img.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent?.trim()).toBe('MF');

    // A new photo gets a fresh try.
    fixture.componentInstance.photo.set('data:image/png;base64,BBBB');
    await fixture.whenStable();
    expect(el.querySelector('img')).not.toBeNull();
  });
});
