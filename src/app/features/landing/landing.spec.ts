import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { LandingSections } from '../../shared/layout/landing-sections';
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

  it('only shows figures INDAB has confirmed', async () => {
    const el = await render();
    const stats = [...el.querySelectorAll('.stats li')].map((li) => [
      li.querySelector('strong')?.textContent,
      li.querySelector('span')?.textContent,
    ]);
    expect(stats).toEqual([['24/7', 'Acceso al material']]);
    expect(el.textContent).not.toContain('Clases grabadas');
  });

  it("lists INDAB's real social networks in the contact section and the footer", async () => {
    const el = await render();
    for (const selector of ['#contacto', 'footer']) {
      const area = el.querySelector(selector)!;
      expect(
        area.querySelector('a[href="https://www.instagram.com/indabacademylp/"]'),
      ).not.toBeNull();
      expect(area.querySelector('a[href="https://www.tiktok.com/@indab.academy"]')).not.toBeNull();
    }
    expect(el.querySelector('#contacto')?.textContent).not.toContain('000 000');
  });

  it('closes with links and the disclaimer, leaving the copyright to the site footer', async () => {
    const el = await render();
    const footer = el.querySelector('footer')!;
    expect(footer.querySelector('a[href="/register"]')).not.toBeNull();
    expect(footer.textContent).toContain('no constituye asesoría financiera');
    expect(footer.textContent).not.toContain('crisortizdev');
  });

  it('animates the sections in on scroll', async () => {
    const el = await render();
    expect(el.querySelectorAll('.reveal').length).toBeGreaterThan(10);
  });

  it('tracks the section on screen for the header and the section menu', async () => {
    const el = await render();
    const sections = TestBed.inject(LandingSections);
    const tops: Record<string, number> = { nosotros: -900, programas: 100 };
    for (const section of el.querySelectorAll<HTMLElement>('section[id]')) {
      section.getBoundingClientRect = () => ({ top: tops[section.id] ?? 2000 }) as DOMRect;
    }
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(sections.current()).toBe('programas');
    const current = el.querySelector('.section-nav a[aria-current="location"]')!;
    expect(current.getAttribute('href')).toBe('#programas');
    expect(current.classList).toContain('active');
    TestBed.resetTestingModule();
    expect(sections.current()).toBeNull();
  });

  it('scrolls to the section named in the link, e.g. /#contacto from the header', async () => {
    // jsdom has no scrollIntoView.
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: Landing }]),
        { provide: AuthService, useValue: auth },
      ],
    });
    const harness = await RouterTestingHarness.create('/#contacto');
    await harness.fixture.whenStable();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('contacto'));
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });
});
