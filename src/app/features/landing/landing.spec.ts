import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { Landing } from './landing';

describe('Landing', () => {
  const auth = { isLoggedIn: signal(false) };

  const render = async () => {
    TestBed.configureTestingModule({
      imports: [Landing],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the hero with the tagline and the sign-up links for visitors', async () => {
    auth.isLoggedIn.set(false);
    const el = await render();
    expect(el.querySelector('h1')?.textContent).toContain('INDAB Academy');
    expect(el.textContent).toContain('Conocimiento. Disciplina. Estrategia. Resultados.');
    expect(el.querySelector('.hero a[href="/register"]')?.textContent).toContain(
      'Únete a la academia',
    );
    expect(el.querySelector('.hero a[href="/login"]')).not.toBeNull();
  });

  it('switches to English and Portuguese without reloading', async () => {
    auth.isLoggedIn.set(false);
    const el = await render();
    const i18n = TestBed.inject(I18n);
    await i18n.use('en-US');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('.hero a[href="/register"]')?.textContent).toContain(
      'Join the academy',
    );
    expect(el.querySelector('.section-nav a[href="#preguntas"]')?.textContent).toBe('FAQ');
    await i18n.use('pt-BR');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.textContent).toContain('Conhecimento. Disciplina. Estratégia. Resultados.');
  });

  it('sends signed-in users to the academy instead', async () => {
    auth.isLoggedIn.set(true);
    const el = await render();
    expect(el.querySelector('.hero a[href="/academy"]')?.textContent).toContain('Ir a la academia');
    expect(el.querySelector('.hero a[href="/register"]')).toBeNull();
  });

  it('renders every section linked from the section menu', async () => {
    const el = await render();
    const links = [...el.querySelectorAll<HTMLAnchorElement>('.section-nav a')];
    expect(links.length).toBe(7);
    for (const link of links) {
      expect(el.querySelector(link.getAttribute('href')!)).not.toBeNull();
    }
  });

  it('links to Eleva with a risk disclaimer', async () => {
    const el = await render();
    expect(el.querySelector('#eleva a[href="/eleva"]')).not.toBeNull();
    expect(el.querySelector('#eleva .disclaimer')?.textContent).toContain('Aviso de riesgo');
  });

  it('credits INDAB and crisortizdev in the footer', async () => {
    const el = await render();
    const footer = el.querySelector('footer')!;
    expect(footer.textContent).toContain('INDAB y crisortizdev. Todos los derechos reservados.');
    const credit = footer.querySelector<HTMLAnchorElement>('a[href="https://crisortiz.github.io"]');
    expect(credit?.textContent).toContain('crisortizdev');
    expect(credit?.target).toBe('_blank');
  });

  it('animates the sections in on scroll', async () => {
    const el = await render();
    expect(el.querySelectorAll('.reveal').length).toBeGreaterThan(10);
  });
});
