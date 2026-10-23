import { TradeExitReason } from '../../core/models/practice';

export const EXIT_REASONS: Record<TradeExitReason, string> = {
  manual: 'Manual',
  stopLoss: 'Stop loss',
  takeProfit: 'Take profit',
  sessionEnd: 'Fin de sesión',
};

/** DecimalPipe format with the decimals that make sense for a price of this size. */
export function priceDigits(price: number): string {
  // NASDAQ ~20000 and gold ~2000: cents; USD/JPY ~150: 3 decimals; EUR/USD ~1.08: 5.
  const decimals = price >= 1000 ? 2 : price >= 10 ? 3 : 5;
  return `1.${decimals}-${decimals}`;
}
