import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GoogleButton } from './google-button';

@Component({
  imports: [GoogleButton],
  template: `<app-google-button
    label="Registrarme con Google"
    [disabled]="disabled()"
    (pressed)="presses = presses + 1"
  />`,
})
class Host {
  readonly disabled = signal(false);
  presses = 0;
}

describe('GoogleButton', () => {
  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    return { fixture, button };
  }

  it('shows the label with the Google mark and reports clicks', () => {
    const { fixture, button } = setup();
    expect(button.textContent?.trim()).toBe('Registrarme con Google');
    expect(button.querySelector('svg.google-logo')).not.toBeNull();
    button.click();
    expect(fixture.componentInstance.presses).toBe(1);
  });

  it('can be disabled', () => {
    const { fixture, button } = setup();
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });
});
