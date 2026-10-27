import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
import { AppInstall } from '../../core/pwa/app-install.service';
import { InstallHelp } from './install-help';

describe('InstallHelp', () => {
  const helpOpen = signal(true);
  const install = { helpOpen, closeHelp: () => helpOpen.set(false) };

  const render = async () => {
    TestBed.configureTestingModule({ providers: [{ provide: AppInstall, useValue: install }] });
    const fixture = TestBed.createComponent(InstallHelp);
    await fixture.whenStable();
    return fixture;
  };
  const dialog = (el: HTMLElement) => el.querySelector<HTMLElement>('[role="dialog"]');

  beforeEach(() => helpOpen.set(true));

  it('explains Share > Add to Home Screen, focused for screen readers', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    expect(dialog(el)?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog(el));
    const steps = [...el.querySelectorAll('li')].map((li) => li.textContent?.trim());
    expect(steps).toEqual([
      'Toca el botón Compartir de la barra del navegador.',
      'Elige «Agregar a inicio».',
      'Toca «Agregar» para terminar.',
    ]);
  });

  it('closes with the button, the backdrop or Escape', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.btn')!.click();
    await fixture.whenStable();
    expect(dialog(el)).toBeNull();

    helpOpen.set(true);
    await fixture.whenStable();
    el.querySelector<HTMLElement>('.backdrop')!.click();
    await fixture.whenStable();
    expect(dialog(el)).toBeNull();

    helpOpen.set(true);
    await fixture.whenStable();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(dialog(el)).toBeNull();
  });

  it('follows the chosen language', async () => {
    const fixture = await render();
    await TestBed.inject(I18n).use('en-US', false);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('“Add to Home Screen”');
  });
});
