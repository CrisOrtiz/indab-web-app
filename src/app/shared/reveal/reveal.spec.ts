import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { Reveal } from './reveal';

@Component({
  imports: [Reveal],
  template: `<p appReveal>a</p>
    <p [appReveal]="120">b</p>`,
})
class Host {}

describe('Reveal', () => {
  afterEach(() => vi.unstubAllGlobals());

  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('p')];
  };

  it('reveals at once when IntersectionObserver is missing', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const [a, b] = await render();
    expect(a.classList).toContain('reveal');
    expect(a.classList).toContain('revealed');
    expect(b.style.getPropertyValue('--reveal-delay')).toBe('120ms');
  });

  it('reveals an element when it scrolls into view', async () => {
    const callbacks: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          callbacks.push(cb);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const [a] = await render();
    expect(a.classList).not.toContain('revealed');
    callbacks[0]([{ isIntersecting: false }]);
    expect(a.classList).not.toContain('revealed');
    callbacks[0]([{ isIntersecting: true }]);
    expect(a.classList).toContain('revealed');
    expect(disconnect).toHaveBeenCalled();
  });
});
