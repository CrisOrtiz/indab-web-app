import { WritableSignal, computed, signal } from '@angular/core';
import {
  Candle,
  OrderType,
  PracticeTrade,
  TradeExitReason,
  TradeSide,
} from '../../core/models/practice';
import { Messages, es } from '../../core/i18n/messages/es';

export const STARTING_BALANCE = 200;
/** Units (troy ounces of gold) in one lot, as brokers quote XAU/USD. */
export const LOT_SIZE = 100;
/** Smallest lot step. */
export const LOT_STEP = 0.01;
/** 1:100: a position needs margin of 1% of its value. */
export const LEVERAGE = 100;
/** Positions are closed when equity falls below this share of the margin in use. */
export const STOP_OUT_LEVEL = 0.5;

export interface OpenTradeInput {
  side: TradeSide;
  orderType: OrderType;
  /** Limit or stop price; ignored for market orders. */
  price: number | null;
  /** Position size in lots of `LOT_SIZE` units. */
  lots: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

/** New stop loss / take profit for a trade, and the price of a pending order. */
export interface TradeLevels {
  stopLoss: number | null;
  takeProfit: number | null;
  orderPrice?: number | null;
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Size of a trade in lots. */
export function tradeLots(trade: Pick<PracticeTrade, 'quantity'>): number {
  return round(trade.quantity / LOT_SIZE, 4);
}

/** Margin (USD) a position of `lots` at `price` ties up. */
export function marginFor(lots: number, price: number): number {
  return round((lots * LOT_SIZE * price) / LEVERAGE, 2);
}

/** Profit or loss (USD) of a trade if it closed at `exitPrice`. */
export function tradePnl(trade: PracticeTrade, exitPrice: number): number {
  const direction = trade.side === 'long' ? 1 : -1;
  return round(direction * (exitPrice - trade.entryPrice) * trade.quantity, 2);
}

/**
 * Buy limits and sell stops wait below the price and fill when it falls to them; buy stops
 * and sell limits wait above and fill when it rises.
 */
export function fillsBelow(side: TradeSide, orderType: OrderType): boolean {
  return (side === 'long') === (orderType === 'limit');
}

/** The price a pending order fills at on this candle, or null. A gap fills at the open. */
export function orderFill(order: PracticeTrade, candle: Candle): number | null {
  const price = order.orderPrice!;
  if (fillsBelow(order.side, order.orderType)) {
    return candle.low <= price ? Math.min(candle.open, price) : null;
  }
  return candle.high >= price ? Math.max(candle.open, price) : null;
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

/** Texts of the order checks; Spanish unless the page passes the current language. */
export type OrderMessages = Messages['orderErrors'];
type Reference = Parameters<OrderMessages['level']>[3];

/** Error if the stop loss or take profit is on the wrong side of `reference`. */
export function validateLevels(
  side: TradeSide,
  price: number,
  stopLoss: number | null,
  takeProfit: number | null,
  reference: Reference = 'entry',
  t: OrderMessages = es.orderErrors,
): string | null {
  if ((stopLoss !== null && !(stopLoss > 0)) || (takeProfit !== null && !(takeProfit > 0))) {
    return t.levelsPositive;
  }
  if (side === 'long') {
    if (stopLoss !== null && stopLoss >= price) {
      return t.level(side, 'stopLoss', true, reference);
    }
    if (takeProfit !== null && takeProfit <= price) {
      return t.level(side, 'takeProfit', false, reference);
    }
  } else {
    if (stopLoss !== null && stopLoss <= price) {
      return t.level(side, 'stopLoss', false, reference);
    }
    if (takeProfit !== null && takeProfit >= price) {
      return t.level(side, 'takeProfit', true, reference);
    }
  }
  return null;
}

/** Error if a limit or stop price is on the wrong side of the current price. */
export function validateOrderPrice(
  side: TradeSide,
  orderType: OrderType,
  price: number | null,
  current: number,
  t: OrderMessages = es.orderErrors,
): string | null {
  if (orderType === 'market') {
    return null;
  }
  if (price === null || !(price > 0)) {
    return t.priceRequired;
  }
  const below = fillsBelow(side, orderType);
  if (below ? price >= current : price <= current) {
    return t.orderPrice(side, orderType, below);
  }
  return null;
}

/** Returns an error message if the order is invalid, or null if it is fine. */
export function validateOrder(
  input: OpenTradeInput,
  current: number,
  available: number,
  t: OrderMessages = es.orderErrors,
): string | null {
  if (
    !(input.lots >= LOT_STEP) ||
    Math.abs(input.lots / LOT_STEP - Math.round(input.lots / LOT_STEP)) > 1e-6
  ) {
    return t.lotStep(LOT_STEP);
  }
  const market = input.orderType === 'market';
  const margin = marginFor(input.lots, market || !(input.price! > 0) ? current : input.price!);
  if (margin > available) {
    return t.margin(margin.toFixed(2), available.toFixed(2));
  }
  return (
    validateOrderPrice(input.side, input.orderType, input.price, current, t) ??
    validateLevels(
      input.side,
      market ? current : input.price!,
      input.stopLoss,
      input.takeProfit,
      market ? 'current' : 'order',
      t,
    )
  );
}

/**
 * Bar-by-bar replay of a candle series with simulated orders. Pure state (no Firestore,
 * no chart): the page persists what it returns and draws the visible candles. The series can
 * grow while the replay runs (`extend`), so the page can fetch it a chunk at a time.
 */
export class Replay {
  private readonly _cursor = signal(0);
  private readonly _trades = signal<PracticeTrade[]>([]);
  private readonly _candles: WritableSignal<Candle[]>;
  /** False while more candles may still be appended. */
  private readonly complete: WritableSignal<boolean>;

  /** Index of the last visible candle. */
  readonly cursor = this._cursor.asReadonly();
  readonly trades = this._trades.asReadonly();
  readonly current = computed(() => this.candles[this.cursor()]);
  /** The last loaded candle is showing: stepping needs more data, or the replay is over. */
  readonly atEnd = computed(() => this.cursor() >= this._candles().length - 1);
  readonly finished = computed(() => this.atEnd() && this.complete());
  readonly hasAllCandles = computed(() => this.complete());
  readonly progress = computed(
    () => (this.cursor() - this.historyBars + 1) / (this.candles.length - this.historyBars),
  );
  readonly pendingOrders = computed(() => this._trades().filter((t) => t.status === 'pending'));
  readonly openTrades = computed(() => this._trades().filter((t) => t.status === 'open'));
  readonly closedTrades = computed(() => this._trades().filter((t) => t.status === 'closed'));
  /** Orders that became positions (open or closed). */
  readonly filledCount = computed(() => this.openTrades().length + this.closedTrades().length);
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
  /** Margin tied up by open positions. */
  readonly usedMargin = computed(() =>
    round(
      this.openTrades().reduce((sum, t) => sum + marginFor(tradeLots(t), t.entryPrice), 0),
      2,
    ),
  );
  /** Free margin: equity not tied up by positions nor reserved by pending orders. */
  readonly available = computed(() =>
    round(
      this.equity() -
        this.usedMargin() -
        this.pendingOrders().reduce((sum, t) => sum + marginFor(tradeLots(t), t.entryPrice), 0),
      2,
    ),
  );
  /** Equity as a share of the margin in use, or null with no open positions. */
  readonly marginLevel = computed(() =>
    this.usedMargin() > 0 ? this.equity() / this.usedMargin() : null,
  );
  readonly winRate = computed(() => {
    const closed = this.closedTrades();
    return closed.length ? closed.filter((t) => (t.pnl ?? 0) > 0).length / closed.length : null;
  });

  constructor(
    candles: Candle[],
    readonly historyBars: number,
    readonly startingBalance = STARTING_BALANCE,
    /** True when `extend` will append more candles later. */
    more = false,
  ) {
    if (candles.length <= historyBars) {
      throw new Error('Not enough candles to replay');
    }
    this._candles = signal(candles);
    this.complete = signal(!more);
    this._cursor.set(historyBars - 1);
  }

  get candles(): Candle[] {
    return this._candles();
  }

  /** Appends candles after the last one; `last` says no more will come. */
  extend(candles: Candle[], last = false): void {
    const end = this.candles.at(-1)!.time;
    this._candles.update((list) => [...list, ...candles.filter((c) => c.time > end)]);
    if (last) {
      this.complete.set(true);
    }
  }

  /**
   * Shows the next candle, fills the pending orders it reaches and closes the trades whose
   * stop loss or take profit it hits. An order filled on this candle is checked for its
   * stops from the next candle on. If equity then falls below `STOP_OUT_LEVEL` of the margin
   * in use, every position is closed at the close (stop out), as a broker would.
   */
  step(): { candle: Candle; filled: PracticeTrade[]; closed: PracticeTrade[] } | null {
    if (this.atEnd()) {
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
    const filled: PracticeTrade[] = [];
    for (const order of this.pendingOrders()) {
      const price = orderFill(order, candle);
      if (price !== null) {
        filled.push(
          this.replace({ ...order, status: 'open', entryPrice: price, entryTime: candle.time }),
        );
      }
    }
    const level = this.marginLevel();
    if (level !== null && level < STOP_OUT_LEVEL) {
      closed.push(...this.openTrades().map((t) => this.close(t.id, 'stopOut')));
    }
    return { candle, filled, closed };
  }

  /**
   * Places an order: a market order opens at the current close, a limit or stop order waits.
   * Throws the validation message, in the language of `t`, if it is invalid.
   */
  open(id: string, input: OpenTradeInput, t: OrderMessages = es.orderErrors): PracticeTrade {
    const { close, time } = this.current();
    const error = validateOrder(input, close, this.available(), t);
    if (error) {
      throw new Error(error);
    }
    const market = input.orderType === 'market';
    const price = market ? close : input.price!;
    const trade: PracticeTrade = {
      id,
      uid: '',
      side: input.side,
      orderType: input.orderType,
      orderPrice: market ? null : price,
      placedTime: time,
      quantity: round(input.lots * LOT_SIZE, 6),
      entryPrice: price,
      entryTime: time,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      status: market ? 'open' : 'pending',
    };
    this._trades.update((trades) => [...trades, trade]);
    return trade;
  }

  /**
   * Moves the stop loss and take profit of a pending order or open trade, and the price of a
   * pending order. Throws the validation message, in the language of `t`, if the new levels
   * are invalid.
   */
  modify(id: string, levels: TradeLevels, t: OrderMessages = es.orderErrors): PracticeTrade {
    const trade = this.find(id);
    const current = this.current().close;
    let error: string | null;
    let next: PracticeTrade;
    if (trade.status === 'pending') {
      const orderPrice = levels.orderPrice ?? trade.orderPrice;
      error =
        validateOrderPrice(trade.side, trade.orderType, orderPrice, current, t) ??
        validateLevels(trade.side, orderPrice!, levels.stopLoss, levels.takeProfit, 'order', t);
      next = { ...trade, ...levels, orderPrice, entryPrice: orderPrice! };
    } else if (trade.status === 'open') {
      error = validateLevels(trade.side, current, levels.stopLoss, levels.takeProfit, 'current', t);
      next = { ...trade, stopLoss: levels.stopLoss, takeProfit: levels.takeProfit };
    } else {
      throw new Error(t.closed);
    }
    if (error) {
      throw new Error(error);
    }
    return this.replace(next);
  }

  /** Cancels a pending order. */
  cancel(id: string): PracticeTrade {
    const order = this.find(id);
    if (order.status !== 'pending') {
      throw new Error(`Order ${id} is not pending`);
    }
    return this.replace({ ...order, status: 'cancelled' });
  }

  /** Closes an open trade at the current close. */
  close(id: string, reason: TradeExitReason = 'manual'): PracticeTrade {
    return this.settle(id, this.current().close, reason);
  }

  /** Forgets an order that was never logged. */
  discard(id: string): void {
    this._trades.update((trades) => trades.filter((t) => t.id !== id));
  }

  /** Puts back a trade as it was, e.g. when a change could not be logged. */
  restore(trade: PracticeTrade): void {
    this.replace(trade);
  }

  /** Cancels pending orders and closes open trades at the current close (end of the replay). */
  closeAll(reason: TradeExitReason): { cancelled: PracticeTrade[]; closed: PracticeTrade[] } {
    return {
      cancelled: this.pendingOrders().map((o) => this.cancel(o.id)),
      closed: this.openTrades().map((t) => this.close(t.id, reason)),
    };
  }

  private settle(id: string, price: number, reason: TradeExitReason): PracticeTrade {
    const trade = this.find(id);
    if (trade.status !== 'open') {
      throw new Error(`Trade ${id} is not open`);
    }
    return this.replace({
      ...trade,
      status: 'closed',
      exitPrice: price,
      exitTime: this.current().time,
      exitReason: reason,
      pnl: tradePnl(trade, price),
    });
  }

  private find(id: string): PracticeTrade {
    const trade = this._trades().find((t) => t.id === id);
    if (!trade) {
      throw new Error(`Unknown trade ${id}`);
    }
    return trade;
  }

  private replace(trade: PracticeTrade): PracticeTrade {
    this._trades.update((trades) => trades.map((t) => (t.id === trade.id ? trade : t)));
    return trade;
  }
}
