import { widgetConfig } from './widget';

describe('widgetConfig', () => {
  it('asks TradingView for the chosen economies and impact in the page language', () => {
    expect(widgetConfig({ countries: ['jp', 'us'], importance: 'high' }, 'es-419')).toMatchObject({
      locale: 'es',
      countryFilter: 'us,jp',
      importanceFilter: '1',
    });
  });

  it('adds medium-impact events and maps Brazilian Portuguese to TradingView’s code', () => {
    expect(widgetConfig({ countries: ['cn'], importance: 'medium' }, 'pt-BR')).toMatchObject({
      locale: 'br',
      countryFilter: 'cn',
      importanceFilter: '0,1',
    });
    expect(widgetConfig({ countries: ['us'], importance: 'high' }, 'en-US').locale).toBe('en');
  });
});
