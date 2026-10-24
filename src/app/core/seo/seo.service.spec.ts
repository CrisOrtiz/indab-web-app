import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { I18n } from '../i18n/i18n.service';
import { Seo, SeoData } from './seo.service';

@Component({ template: '' })
class Page {}

describe('Seo', () => {
  const head = () => document.head;
  const meta = (selector: string) =>
    head().querySelector(`meta[${selector}]`)?.getAttribute('content');

  beforeEach(async () => {
    head()
      .querySelectorAll('meta, link')
      .forEach((el) => el.remove());
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'eleva',
            title: 'eleva',
            data: { description: 'eleva' } satisfies SeoData,
            component: Page,
          },
          { path: 'academy', title: 'academy', component: Page },
        ]),
      ],
    });
    TestBed.inject(Seo);
  });

  it('describes public pages and lists their language alternates', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/eleva?ref=whatsapp#top');
    TestBed.tick();

    expect(meta('name="robots"')).toBe('index, follow');
    expect(meta('name="description"')).toContain('brazo de inversión de INDAB');
    expect(meta('property="og:title"')).toBe('Eleva Inversiones | INDAB');
    expect(meta('property="og:url"')).toBe('https://indab-academy.web.app/eleva');
    expect(meta('property="og:image"')).toBe('https://indab-academy.web.app/og-image.png');
    expect(meta('property="og:locale"')).toBe('es_LA');
    expect(meta('name="twitter:card"')).toBe('summary_large_image');
    expect(head().querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://indab-academy.web.app/eleva',
    );
    const alternates = [...head().querySelectorAll('link[hreflang]')].map(
      (l) => `${l.getAttribute('hreflang')} ${l.getAttribute('href')}`,
    );
    expect(alternates).toEqual([
      'es-419 https://indab-academy.web.app/eleva',
      'en-US https://indab-academy.web.app/eleva?lang=en',
      'pt-BR https://indab-academy.web.app/eleva?lang=pt',
      'x-default https://indab-academy.web.app/eleva',
    ]);
  });

  it('follows a language switch without duplicating tags', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/eleva');
    await TestBed.inject(I18n).use('pt-BR');
    TestBed.tick();

    expect(meta('name="description"')).toContain('braço de investimentos');
    expect(meta('property="og:locale"')).toBe('pt_BR');
    expect(
      [...head().querySelectorAll('meta[property="og:locale:alternate"]')].map((m) =>
        m.getAttribute('content'),
      ),
    ).toEqual(['es_LA', 'en_US']);
    expect(head().querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(head().querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://indab-academy.web.app/eleva?lang=pt',
    );
    expect(head().querySelectorAll('link[hreflang]')).toHaveLength(4);
  });

  it('keeps signed-in pages out of search results', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/eleva');
    await harness.navigateByUrl('/academy');
    TestBed.tick();

    expect(meta('name="robots"')).toBe('noindex');
    expect(meta('property="og:title"')).toBe('Academia | INDAB');
    expect(head().querySelectorAll('link[hreflang]')).toHaveLength(0);
  });
});
