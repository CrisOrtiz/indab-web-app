import { TestBed } from '@angular/core/testing';
import { Language } from '../../core/i18n/i18n.service';
import { Flag } from './flag';

describe('Flag', () => {
  const draw = async (language: Language) => {
    const fixture = TestBed.createComponent(Flag);
    fixture.componentRef.setInput('language', language);
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('svg') as SVGElement;
  };

  it('draws Mexico, the USA and Brazil as decorative SVG', async () => {
    const mexico = await draw('es-419');
    expect(mexico.getAttribute('aria-hidden')).toBe('true');
    expect([...mexico.querySelectorAll('rect')].map((r) => r.getAttribute('fill'))).toEqual([
      '#006847',
      '#fff',
      '#ce1126',
    ]);

    const usa = await draw('en-US');
    // Red field, six white stripes and the blue canton.
    expect(usa.querySelectorAll('rect')).toHaveLength(8);
    expect(usa.querySelector('rect:last-of-type')!.getAttribute('fill')).toBe('#3c3b6e');

    const brazil = await draw('pt-BR');
    expect(brazil.querySelector('path')!.getAttribute('fill')).toBe('#ffdf00');
    expect(brazil.querySelector('circle')!.getAttribute('fill')).toBe('#002776');
  });
});
