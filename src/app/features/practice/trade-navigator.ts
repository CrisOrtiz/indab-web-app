import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, model } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalDatePipe } from '../../core/i18n/local-date.pipe';
import { PracticeTrade } from '../../core/models/practice';
import { formatLots, priceDigits, signedMoney } from './practice-format';
import { tradeLots } from './replay';

/**
 * Steps through the trades of a session under its chart: previous and next buttons, a list to
 * jump to any of them, and the details of the one picked, which the chart scrolls to.
 */
@Component({
  selector: 'app-trade-navigator',
  imports: [DecimalPipe, LocalDatePipe],
  templateUrl: './trade-navigator.html',
  styleUrl: './trade-navigator.scss',
})
export class TradeNavigator {
  /** Filled trades, in the order they were opened (`filledTrades`). */
  readonly trades = input.required<PracticeTrade[]>();
  /** Id of the trade shown. */
  readonly selected = model<string | null>(null);

  protected readonly i18n = inject(I18n);
  protected readonly priceDigits = priceDigits;
  protected readonly signed = signedMoney;
  protected readonly lots = (t: PracticeTrade) => formatLots(tradeLots(t));

  protected readonly index = computed(() =>
    this.trades().findIndex((t) => t.id === this.selected()),
  );
  protected readonly current = computed(() => this.trades()[this.index()] ?? null);

  protected step(by: number): void {
    const list = this.trades();
    const index = this.index();
    const next = index < 0 ? 0 : Math.min(list.length - 1, Math.max(0, index + by));
    this.selected.set(list[next]?.id ?? null);
  }
}
