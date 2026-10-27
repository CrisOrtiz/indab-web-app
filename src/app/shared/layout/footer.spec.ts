import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
import { AppInstall } from '../../core/pwa/app-install.service';
import { Footer } from './footer';

describe('Footer', () => {
  const render = async () => {
    const fixture = TestBed.createComponent(Footer);
    await fixture.whenStable();
    return fixture;
  };

  it('shows the copyright with the current year and credits crisortizdev', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    const year = new Date().getFullYear();
    expect(el.textContent).toContain(
      `© ${year} INDAB y crisortizdev. Todos los derechos reservados.`,
    );
    expect(el.textContent).toContain('Desarrollado por');
    const credit = el.querySelector<HTMLAnchorElement>('a[href="https://crisortiz.github.io"]');
    expect(credit?.textContent).toContain('crisortizdev');
    expect(credit?.target).toBe('_blank');
    expect(credit?.rel).toBe('noopener');
  });

  it('follows the chosen language', async () => {
    const fixture = await render();
    await TestBed.inject(I18n).use('en-US', false);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('INDAB and crisortizdev. All rights reserved.');
    expect(el.textContent).toContain('Built by');
  });

  it('offers "Install app" only where the browser can install the site', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.install')).toBeNull();

    TestBed.inject(AppInstall).ios.set(true);
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.install')!.click();
    expect(el.querySelector('.install')?.textContent?.trim()).toBe('Instalar app');
    expect(TestBed.inject(AppInstall).helpOpen()).toBe(true);
  });
});
