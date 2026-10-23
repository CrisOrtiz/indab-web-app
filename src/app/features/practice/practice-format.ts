import { OrderType, PracticeTrade, TradeExitReason } from '../../core/models/practice';

export const EXIT_REASONS: Record<TradeExitReason, string> = {
  manual: 'Manual',
  stopLoss: 'Stop loss',
  takeProfit: 'Take profit',
  sessionEnd: 'Fin de sesión',
};

export const ORDER_TYPES: Record<OrderType, string> = {
  market: 'Mercado',
  limit: 'Límite',
  stop: 'Stop',
};

/** "Compra", "Venta límite", "Compra stop"... */
export function orderLabel(trade: Pick<PracticeTrade, 'side' | 'orderType'>): string {
  const side = trade.side === 'long' ? 'Compra' : 'Venta';
  return trade.orderType === 'market'
    ? side
    : `${side} ${ORDER_TYPES[trade.orderType].toLowerCase()}`;
}

/** Decimals that make sense for a price of this size. */
export function priceDecimals(price: number): number {
  // NASDAQ ~20000 and gold ~2000: cents; USD/JPY ~150: 3 decimals; EUR/USD ~1.08: 5.
  return price >= 1000 ? 2 : price >= 10 ? 3 : 5;
}

/** Rounds a price to `priceDecimals`. */
export function roundPrice(price: number): number {
  return Number(price.toFixed(priceDecimals(price)));
}

/** DecimalPipe format with `priceDecimals`. */
export function priceDigits(price: number): string {
  const decimals = priceDecimals(price);
  return `1.${decimals}-${decimals}`;
}
