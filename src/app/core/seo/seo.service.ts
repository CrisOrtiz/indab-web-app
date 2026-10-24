import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { DEFAULT_LANGUAGE, I18n, LANGUAGES, Language } from '../i18n/i18n.service';
import { Messages } from '../i18n/messages/es';
import { TitleKey } from '../i18n/title-strategy';

/** The live site. Canonical links, the sitemap and link previews point here. */
export const SITE_URL = 'https://indab-academy.web.app';

/** Share image for link previews (`public/og-image.png`, 1200 x 630). */
export const SHARE_IMAGE = { path: '/og-image.png', width: 1200, height: 630 };

export type DescriptionKey = keyof Messages['seo']['descriptions'];

/**
 * Route `data` for a public page that search engines should index: its description, a key of
 * `messages.seo.descriptions`. Pages without it are marked `noindex` (they need a sign-in).
 */
export interface SeoData {
  description: DescriptionKey;
}

/** Open Graph locales (Facebook/WhatsApp use `es_LA` for Latin American Spanish). */
const OG_LOCALES: Record<Language, string> = {
  'es-419': 'es_LA',
  'en-US': 'en_US',
  'pt-BR': 'pt_BR',
};

interface Page {
  path: string;
  title?: TitleKey;
  description?: DescriptionKey;
}

/**
 * Keeps the page's meta tags in step with the route and the language: description, robots,
 * canonical link, language alternates (`?lang=`) and Open Graph / Twitter tags for link previews.
 * Runs in the browser and when the public pages are prerendered, so crawlers that do not run
 * JavaScript still get them.
 */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  private readonly page = signal<Page | null>(null);

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.page.set(this.readPage(event.urlAfterRedirects));
      }
    });
    effect(() => {
      const page = this.page();
      if (page) {
        this.apply(page, this.i18n.messages(), this.i18n.language());
      }
    });
  }

  /** Link to `path` in `language`; the default language needs no `?lang=`. */
  static url(path: string, language: Language): string {
    const param = LANGUAGES.find((l) => l.code === language)!.param;
    return SITE_URL + path + (language === DEFAULT_LANGUAGE ? '' : `?lang=${param}`);
  }

  private readPage(url: string): Page {
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const data = route.data as Partial<SeoData>;
    const path = url.split(/[?#]/)[0];
    return { path, title: route.title as TitleKey | undefined, description: data.description };
  }

  private apply(page: Page, messages: Messages, language: Language): void {
    const indexed = page.description !== undefined;
    const description = messages.seo.descriptions[page.description ?? 'landing'];
    const title = (page.title && messages.titles[page.title]) || messages.titles.landing;
    const url = Seo.url(page.path, language);
    const image = SITE_URL + SHARE_IMAGE.path;

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: indexed ? 'index, follow' : 'noindex' });
    this.setTags('property', {
      'og:type': 'website',
      'og:site_name': 'INDAB Academy',
      'og:title': title,
      'og:description': description,
      'og:url': url,
      'og:image': image,
      'og:image:width': String(SHARE_IMAGE.width),
      'og:image:height': String(SHARE_IMAGE.height),
      'og:image:alt': messages.seo.imageAlt,
      'og:locale': OG_LOCALES[language],
    });
    this.meta.getTags('property="og:locale:alternate"').forEach((tag) => tag.remove());
    for (const other of LANGUAGES.filter((l) => l.code !== language)) {
      this.meta.addTag({ property: 'og:locale:alternate', content: OG_LOCALES[other.code] });
    }
    this.setTags('name', {
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': image,
    });

    this.setLink('canonical', url);
    this.document.head
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((l) => l.remove());
    if (indexed) {
      for (const { code } of LANGUAGES) {
        this.addLink({ rel: 'alternate', hreflang: code, href: Seo.url(page.path, code) });
      }
      this.addLink({
        rel: 'alternate',
        hreflang: 'x-default',
        href: Seo.url(page.path, DEFAULT_LANGUAGE),
      });
    }
  }

  private setTags(attribute: 'name' | 'property', tags: Record<string, string>): void {
    for (const [key, content] of Object.entries(tags)) {
      this.meta.updateTag({ [attribute]: key, content }, `${attribute}="${key}"`);
    }
  }

  private setLink(rel: string, href: string): void {
    const link =
      this.document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`) ??
      this.addLink({ rel, href });
    link.setAttribute('href', href);
  }

  private addLink(attributes: Record<string, string>): HTMLLinkElement {
    const link = this.document.createElement('link');
    for (const [key, value] of Object.entries(attributes)) {
      link.setAttribute(key, value);
    }
    this.document.head.appendChild(link);
    return link;
  }
}
