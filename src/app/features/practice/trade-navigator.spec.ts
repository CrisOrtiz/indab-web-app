import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PracticeTrade } from '../../core/models/practice';
import { TradeNavigator } from './trade-navigator';

const base: PracticeTrade = {
  id: 'a',
  uid: 'u',
  side: 'long',
  orderType: 'limit',
  orderPrice: 2000,
  placedTime: 1_620_000_000,
  quantity: 10,
  entryPrice: 2000,
  entryTime: 1_620_000_000,
  stopLoss: 1990,
  takeProfit: 2020,
  status: 'closed',
  exitPrice: 2020,
  exitTime: 1_620_003_600,
  exitReason: 'takeProfit',
  pnl: 200,
};

@Component({
  imports: [TradeNavigator],
  template: `<app-trade-navigator [trades]="trades" [(selected)]="selected" />`,
})
class Host {
  readonly trades: PracticeTrade[] = [
    base,
    {
      ...base,
      id: 'b',
      side: 'short',
      orderType: 'market',
      stopLoss: null,
      takeProfit: null,
      exitPrice: 2005,
      exitReason: 'manual',
      pnl: -50,
    },
    { ...base, id: 'c', status: 'open', exitPrice: undefined, pnl: undefined },
  ];
  readonly selected = signal<string | null>('a');
}

describe('TradeNavigator', () => {
  it('steps through the trades and shows the details of each', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const host = fixture.componentInstance;
    const button = (name: RegExp) =>
      [...el.querySelectorAll('button')].find((b) => name.test(b.textContent!))!;
    const text = () => el.querySelector('.details')!.textContent!.replace(/\s+/g, ' ');

    expect(el.querySelector('.counter')!.textContent).toContain('Operación 1 de 3');
    expect(text()).toContain('Compra límite');
    expect(text()).toContain('0.10');
    expect(text()).toContain('1,990.00 / 2,020.00');
    expect(text()).toContain('Take profit');
    expect(text()).toContain('+200.00 USD');
    expect(button(/Anterior/).disabled).toBe(true);

    button(/Siguiente/).click();
    await fixture.whenStable();
    expect(host.selected()).toBe('b');
    expect(text()).toContain('Venta');
    expect(text()).toContain('— / —');
    expect(text()).toContain('-50.00 USD');

    button(/Siguiente/).click();
    await fixture.whenStable();
    expect(text()).toContain('Sigue abierta');
    expect(button(/Siguiente/).disabled).toBe(true);

    // The list jumps to any trade.
    const select = el.querySelector('select')!;
    expect([...select.options].map((o) => o.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      '#1 · Compra límite · 0.10 · +200.00',
      '#2 · Venta · 0.10 · -50.00',
      '#3 · Compra límite · 0.10 · Sigue abierta',
    ]);
    select.value = 'a';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(host.selected()).toBe('a');
  });

  it('starts from the first trade when none is picked', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.selected.set(null);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.details')).toBeNull();
    [...el.querySelectorAll('button')].find((b) => /Siguiente/.test(b.textContent!))!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('a');
  });
});
