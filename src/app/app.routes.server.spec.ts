import { RenderMode } from '@angular/ssr';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';

describe('server routes', () => {
  const indexed = routes.filter((r) => r.data?.['description']).map((r) => r.path);
  const prerendered = serverRoutes
    .filter((r) => r.renderMode === RenderMode.Prerender)
    .map((r) => r.path);

  it('prerenders exactly the pages offered to search engines', () => {
    expect(prerendered).toEqual(indexed);
    expect(serverRoutes.at(-1)).toEqual({ path: '**', renderMode: RenderMode.Client });
  });
});
