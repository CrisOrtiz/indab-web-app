import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReplayControls } from './replay-controls';

@Component({
  imports: [ReplayControls],
  template: `<app-replay-controls
    [playing]="playing()"
    [speed]="speed()"
    [speeds]="[1, 2, 5, 10]"
    (step)="steps = steps + 1"
    (togglePlay)="playing.set(!playing())"
    (speedChange)="speed.set($event)"
    (finish)="finished = true"
  />`,
})
class Host {
  readonly playing = signal(false);
  readonly speed = signal(2);
  steps = 0;
  finished = false;
}

describe('ReplayControls', () => {
  let host: Host;
  let el: HTMLElement;
  let stable: () => Promise<unknown>;

  beforeEach(async () => {
    const fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.autoDetectChanges();
    stable = () => fixture.whenStable();
    await stable();
  });

  const byLabel = (label: string) =>
    el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  it('steps, plays and pauses with named icon buttons', async () => {
    byLabel('Siguiente vela').click();
    expect(host.steps).toBe(1);

    byLabel('Reproducir').click();
    expect(host.playing()).toBe(true);
    await stable();
    const play = el.querySelector<HTMLButtonElement>('button.play')!;
    expect(play.getAttribute('aria-label')).toBe('Pausar');
    expect(play.getAttribute('aria-pressed')).toBe('true');
    expect(play.classList).toContain('on');
  });

  it('picks the speed in a radio group and spins the ring faster', async () => {
    const radios = [...el.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((r) => r.textContent?.trim())).toEqual(['1×', '2×', '5×', '10×']);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    const play = el.querySelector<HTMLElement>('button.play')!;
    const slow = parseFloat(play.style.getPropertyValue('--spin'));

    byLabel('5 velas/s').click();
    await stable();
    expect(host.speed()).toBe(5);
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector<HTMLElement>('.speeds')!.style.getPropertyValue('--i')).toBe('2');
    expect(parseFloat(play.style.getPropertyValue('--spin'))).toBeLessThan(slow);
  });

  it('toggles with Space, but not while typing or on a focused button', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(host.playing()).toBe(true);

    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    input.remove();
    byLabel('Siguiente vela').dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );
    expect(host.playing()).toBe(true);
  });

  it('ends the session', () => {
    const finish = el.querySelector<HTMLButtonElement>('button.finish')!;
    expect(finish.textContent?.trim()).toBe('Terminar sesión');
    finish.click();
    expect(host.finished).toBe(true);
  });
});
