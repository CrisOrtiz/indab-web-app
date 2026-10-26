import { widgetConfig } from './widget';

describe('widgetConfig', () => {
  it('asks TradingView for the chosen economies and impact in the page language', () => {
    expect(widgetConfig({ countries: ['jp', 'us'], importance: ['high'] }, 'es-419')).toMatchObject(
      {
        locale: 'es',
        countryFilter: 'us,jp',
        importanceFilter: '1',
      },
    );
  });

  it('maps each impact folder to TradingView’s level and Brazilian Portuguese to its code', () => {
    expect(
      widgetConfig({ countries: ['cn'], importance: ['high', 'low', 'medium'] }, 'pt-BR'),
    ).toMatchObject({
      locale: 'br',
      countryFilter: 'cn',
      importanceFilter: '-1,0,1',
    });
    expect(widgetConfig({ countries: ['us'], importance: ['medium'] }, 'en-US')).toMatchObject({
      locale: 'en',
      importanceFilter: '0',
    });
  });
});
