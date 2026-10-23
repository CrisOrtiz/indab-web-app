import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { PracticeTrade } from '../../core/models/practice';
import { signedMoney } from './practice-format';
import { sessionStats } from './stats';

const WIDTH = 600;
const HEIGHT = 140;
const PAD = 6;

/**
 * Statistics of a practice session (win rate, profit factor, drawdown...) and its equity
 * curve, for the student during and after the replay and for the admin review.
 */
@Component({
  selector: 'app-session-stats',
  imports: [DecimalPipe, PercentPipe],
  templateUrl: './session-stats.html',
  styleUrl: './session-stats.scss',
})
export class SessionStatsPanel {
  readonly trades = input.required<PracticeTrade[]>();
  readonly startingBalance = input.required<number>();

  protected readonly signed = signedMoney;
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly stats = computed(() => sessionStats(this.trades(), this.startingBalance()));

  /** The equity curve as SVG points, one step per closed trade, with the start as baseline. */
  protected readonly curve = computed(() => {
    const { equity } = this.stats();
    const values = equity.map((p) => p.balance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x = (i: number) => PAD + (i * (WIDTH - 2 * PAD)) / Math.max(1, equity.length - 1);
    const y = (v: number) => PAD + ((max - v) * (HEIGHT - 2 * PAD)) / span;
    return {
      points: equity.map((p, i) => `${x(i)},${y(p.balance)}`).join(' '),
      baseline: y(this.startingBalance()),
      up: values.at(-1)! >= this.startingBalance(),
    };
  });
}
