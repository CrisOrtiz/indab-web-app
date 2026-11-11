import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PracticeTrade } from '../../core/models/practice';
import { TradeJournal } from './trade-journal';

const trade = (id: string, extra: Partial<PracticeTrade> = {}) =>
  ({
    id,
    uid: 'u',
    side: 'long',
    orderType: 'market',
    orderPrice: null,
    placedTime: 0,
    quantity: 1,
    entryPrice: 4000,
    entryTime: 0,
    stopLoss: 3990,
    takeProfit: 4020,
    status: 'open',
    ...extra,
  }) as PracticeTrade;

@Component({
  imports: [TradeJournal],
  template: `<app-trade-journal
    [trades]="trades()"
    [graded]="graded()"
    (saved)="saved.push($event)"
  />`,
})
class Host {
  readonly trades = signal<PracticeTrade[]>([]);
  readonly graded = signal(true);
  readonly saved: { trade: PracticeTrade; journal: string }[] = [];
}

describe('TradeJournal', () => {
  const render = async (trades: PracticeTrade[]) => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.trades.set(trades);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, el, host: fixture.componentInstance };
  };

  it('shows nothing before the first order', async () => {
    const { el } = await render([]);
    expect(el.querySelector('.journal')).toBeNull();
  });

  it('numbers trades as the navigator, then pending orders, and leaves cancelled ones out', async () => {
    const { el } = await render([
      trade('b', { entryTime: 60, status: 'closed', journal: 'Rechazo en soporte' }),
      trade('a'),
      trade('p', { status: 'pending', orderType: 'limit', orderPrice: 3980, entryPrice: 3980 }),
      trade('c', { status: 'cancelled' }),
    ]);
    const labels = [...el.querySelectorAll('li label')].map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(labels).toEqual([
      'Operación 1 Compra · 4,000.00',
      'Operación 2 Compra · 4,000.00',
      'Orden pendiente Compra límite · 3,980.00',
    ]);
    // In an evaluation, the trades without a reason are pointed out.
    expect([...el.querySelectorAll('li')].map((li) => li.classList.contains('missing'))).toEqual([
      true,
      false,
      true,
    ]);
    expect(el.textContent).toContain('Cuenta para tu nota');
    expect(el.querySelectorAll<HTMLInputElement>('input')[1].value).toBe('Rechazo en soporte');
  });

  it('saves a trimmed entry, even of a closed trade', async () => {
    const closed = trade('b', { status: 'closed' });
    const { fixture, el, host } = await render([closed]);
    const input = el.querySelector('input')!;
    const button = el.querySelector<HTMLButtonElement>('li button')!;
    expect(button.disabled).toBe(true);
    input.value = '  Ruptura del máximo y retesteo  ';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(button.disabled).toBe(false);
    button.click();
    expect(host.saved).toEqual([{ trade: closed, journal: 'Ruptura del máximo y retesteo' }]);
  });

  it('only suggests it in free practice', async () => {
    const { fixture, el, host } = await render([trade('a')]);
    host.graded.set(false);
    await fixture.whenStable();
    expect(el.querySelector('.missing')).toBeNull();
    expect(el.textContent).toContain('te ayuda a revisar tus decisiones');
  });
});
