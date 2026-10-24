import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * The public pages are prerendered to static HTML at build time (in Spanish), so search engines
 * and link previews (WhatsApp, Facebook, LinkedIn) see their content and meta tags. Everything
 * else renders in the browser only; Firebase Hosting serves it `index.csr.html`.
 * Keep this list in sync with `public/sitemap.xml`.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'eleva', renderMode: RenderMode.Prerender },
  { path: 'login', renderMode: RenderMode.Prerender },
  { path: 'register', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
