import { TestBed } from '@angular/core/testing';
import { I18n } from '../../core/i18n/i18n.service';
import { SOCIAL_LINKS, SocialLinks } from './social-links';

describe('SocialLinks', () => {
  const render = async (labels = false) => {
    const fixture = TestBed.createComponent(SocialLinks);
    fixture.componentRef.setInput('labels', labels);
    await fixture.whenStable();
    return fixture;
  };

  it("links INDAB's Instagram and TikTok in a new tab", async () => {
    const el = (await render()).nativeElement as HTMLElement;
    const links = [...el.querySelectorAll<HTMLAnchorElement>('a')];
    expect(links.map((a) => a.href)).toEqual([
      'https://www.instagram.com/indabacademylp/',
      'https://www.tiktok.com/@indab.academy',
    ]);
    expect(links.every((a) => a.target === '_blank' && a.rel === 'noopener')).toBe(true);
    expect(links[0].getAttribute('aria-label')).toBe('INDAB en Instagram');
  });

  it('names the network and handle with labels', async () => {
    const el = (await render(true)).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Instagram');
    expect(el.textContent).toContain('@indabacademylp');
    expect(el.textContent).toContain('@indab.academy');
    expect(el.querySelector('a')?.hasAttribute('aria-label')).toBe(false);
  });

  it('follows the chosen language', async () => {
    const fixture = await render();
    await TestBed.inject(I18n).use('pt-BR', false);
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.getAttribute('aria-label')).toBe(`INDAB no ${SOCIAL_LINKS[0].network}`);
  });
});
