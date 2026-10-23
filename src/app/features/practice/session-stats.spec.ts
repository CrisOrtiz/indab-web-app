import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PracticeTrade } from '../../core/models/practice';
import { SessionStatsPanel } from './session-stats';

const closed = (id: string, pnl: number, exitTime: number): PracticeTrade => ({
  id,
  uid: 'u',
  side: 'short',
  orderType: 'market',
  orderPrice: null,
  placedTime: 0,
  quantity: 1,
  entryPrice: 100,
  entryTime: 0,
  stopLoss: null,
  takeProfit: null,
  status: 'closed',
  exitTime,
  pnl,
});

@Component({
  imports: [SessionStatsPanel],
  template: `<app-session-stats [trades]="trades()" [startingBalance]="200" />`,
})
class Host {
  readonly trades = signal<PracticeTrade[]>([]);
}

describe('SessionStatsPanel', () => {
  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const value = (label: string) =>
      [...el.querySelectorAll('.item')]
        .find((i) => i.querySelector('span')?.textContent?.trim() === label)
        ?.querySelector('strong')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim();
    return { fixture, el, host: fixture.componentInstance, value };
  };

  it('asks for closed trades before drawing the equity curve', async () => {
    const { el, value } = await render();
    expect(value('Acierto')).toBe('—');
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).toContain('Cierra operaciones para ver cómo evoluciona tu saldo.');
  });

  it('shows the statistics and the equity curve of the closed trades', async () => {
    const { fixture, el, host, value } = await render();
    host.trades.set([closed('a', 30, 1), closed('b', -10, 2)]);
    await fixture.whenStable();

    expect(value('Operaciones cerradas')).toBe('2');
    expect(value('Acierto')).toBe('50%');
    expect(value('Factor de beneficio')).toBe('3.00');
    expect(value('Promedio por operación')).toBe('+10.00');
    expect(value('Drawdown máximo')).toBe('10.00 USD');
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toBe('Saldo de 200 a 220 USD');
    expect(svg.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(3);
    expect(svg.querySelector('polyline')!.classList).toContain('up');
  });
});
