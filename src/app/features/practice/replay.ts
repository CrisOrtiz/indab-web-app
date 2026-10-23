import { computed, signal } from '@angular/core';
import { Candle, PracticeTrade, TradeExitReason, TradeSide } from '../../core/models/practice';

export const STARTING_BALANCE = 10_000;

export interface OpenTradeInput {
  side: TradeSide;
  /** Position size in USD at the entry price. */
  amount: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Profit or loss (USD) of a trade if it closed at `exitPrice`. */
export function tradePnl(trade: PracticeTrade, exitPrice: number): number {
  const direction = trade.side === 'long' ? 1 : -1;
  return round(direction * (exitPrice - trade.entryPrice) * trade.quantity, 2);
}

/**
 * Whether this candle hits the trade's stop loss or take profit, and at what price.
 * A gap through the level fills at the candle's open. If one candle touches both, the
 * stop loss wins: from OHLC alone we cannot know which came first, so assume the worst.
 */
export function stopHit(
  trade: PracticeTrade,
  candle: Candle,
): { price: number; reason: TradeExitReason } | null {
  const { stopLoss, takeProfit } = trade;
  if (trade.side === 'long') {
    if (stopLoss !== null && candle.low <= stopLoss) {
      return { price: Math.min(candle.open, stopLoss), reason: 'stopLoss' };
    }
    if (takeProfit !== null && candle.high >= takeProfit) {
      return { price: Math.max(candle.open, takeProfit), reason: 'takeProfit' };
    }
  } else {
    if (stopLoss !== null && candle.high >= stopLoss) {
      return { price: Math.max(candle.open, stopLoss), reason: 'stopLoss' };
    }
    if (takeProfit !== null && candle.low <= takeProfit) {
      return { price: Math.min(candle.open, takeProfit), reason: 'takeProfit' };
    }
  }
  return null;
}

/** Returns a Spanish error message if the order is invalid at `price`, or null if it is fine. */
export function validateOrder(
  input: OpenTradeInput,
  price: number,
  available: number,
): string | null {
  if (!(input.amount > 0)) {
    return 'Ingresa un monto mayor a 0.';
  }
  if (input.amount > available) {
    return `El monto supera tu saldo disponible (${available.toFixed(2)} USD).`;
  }
  const { stopLoss, takeProfit } = input;
  if ((stopLoss !== null && !(stopLoss > 0)) || (takeProfit !== null && !(takeProfit > 0))) {
    return 'El stop loss y el take profit deben ser precios mayores a 0.';
  }
  if (input.side === 'long') {
    if (stopLoss !== null && stopLoss >= price) {
      return 'En una compra, el stop loss debe estar por debajo del precio actual.';
    }
    if (takeProfit !== null && takeProfit <= price) {
      return 'En una compra, el take profit debe estar por encima del precio actual.';
    }
  } else {
    if (stopLoss !== null && stopLoss <= price) {
      return 'En una venta, el stop loss debe estar por encima del precio actual.';
    }
    if (takeProfit !== null && takeProfit >= price) {
      return 'En una venta, el take profit debe estar por debajo del precio actual.';
    }
  }
  return null;
}

/**
 * Bar-by-bar replay of a candle series with simulated trades. Pure state (no Firestore,
 * no chart): the page persists what it returns and draws the visible candles.
 */
export class Replay {
  private readonly _cursor = signal(0);
  private readonly _trades = signal<PracticeTrade[]>([]);

  /** Index of the last visible candle. */
  readonly cursor = this._cursor.asReadonly();
  readonly trades = this._trades.asReadonly();
  readonly current = computed(() => this.candles[this.cursor()]);
  readonly finished = computed(() => this.cursor() >= this.candles.length - 1);
  readonly progress = computed(
    () => (this.cursor() - this.historyBars + 1) / (this.candles.length - this.historyBars),
  );
  readonly openTrades = computed(() => this._trades().filter((t) => t.status === 'open'));
  readonly closedTrades = computed(() => this._trades().filter((t) => t.status === 'closed'));
  readonly realized = computed(() =>
    round(
      this.closedTrades().reduce((sum, t) => sum + (t.pnl ?? 0), 0),
      2,
    ),
  );
  readonly balance = computed(() => round(this.startingBalance + this.realized(), 2));
  readonly unrealized = computed(() =>
    round(
      this.openTrades().reduce((sum, t) => sum + tradePnl(t, this.current().close), 0),
      2,
    ),
  );
  readonly equity = computed(() => round(this.balance() + this.unrealized(), 2));
  /** Cash not tied up in open positions (no leverage). */
  readonly available = computed(() =>
    round(
      this.balance() - this.openTrades().reduce((sum, t) => sum + t.quantity * t.entryPrice, 0),
      2,
    ),
  );
  readonly winRate = computed(() => {
    const closed = this.closedTrades();
    return closed.length ? closed.filter((t) => (t.pnl ?? 0) > 0).length / closed.length : null;
  });

  constructor(
    readonly candles: Candle[],
    readonly historyBars: number,
    readonly startingBalance = STARTING_BALANCE,
  ) {
    if (candles.length <= historyBars) {
      throw new Error('Not enough candles to replay');
    }
    this._cursor.set(historyBars - 1);
  }

  /** Shows the next candle and closes the trades whose stop loss or take profit it hits. */
  step(): { candle: Candle; closed: PracticeTrade[] } | null {
    if (this.finished()) {
      return null;
    }
    this._cursor.update((i) => i + 1);
    const candle = this.current();
    const closed: PracticeTrade[] = [];
    for (const trade of this.openTrades()) {
      const hit = stopHit(trade, candle);
      if (hit) {
        closed.push(this.settle(trade.id, hit.price, hit.reason));
      }
    }
    return { candle, closed };
  }

  /** Opens a trade at the current close. Throws the validation message if it is invalid. */
  open(id: string, input: OpenTradeInput): PracticeTrade {
    const price = this.current().close;
    const error = validateOrder(input, price, this.available());
    if (error) {
      throw new Error(error);
    }
    const trade: PracticeTrade = {
      id,
      uid: '',
      side: input.side,
      quantity: round(input.amount / price, 8),
      entryPrice: price,
      entryTime: this.current().time,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      status: 'open',
    };
    this._trades.update((trades) => [...trades, trade]);
    return trade;
  }

  /** Closes an open trade at the current close. */
  close(id: string, reason: TradeExitReason = 'manual'): PracticeTrade {
    return this.settle(id, this.current().close, reason);
  }

  /** Forgets an open trade, e.g. when it could not be logged. */
  discard(id: string): void {
    this._trades.update((trades) => trades.filter((t) => t.id !== id || t.status !== 'open'));
  }

  /** Closes every open trade at the current close (used when the replay ends). */
  closeAll(reason: TradeExitReason): PracticeTrade[] {
    return this.openTrades().map((t) => this.close(t.id, reason));
  }

  private settle(id: string, price: number, reason: TradeExitReason): PracticeTrade {
    const trade = this._trades().find((t) => t.id === id);
    if (!trade || trade.status !== 'open') {
      throw new Error(`Trade ${id} is not open`);
    }
    const closed: PracticeTrade = {
      ...trade,
      status: 'closed',
      exitPrice: price,
      exitTime: this.current().time,
      exitReason: reason,
      pnl: tradePnl(trade, price),
    };
    this._trades.update((trades) => trades.map((t) => (t.id === id ? closed : t)));
    return closed;
  }
}
