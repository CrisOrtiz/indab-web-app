import { TradeExitReason } from '../../core/models/practice';

export const EXIT_REASONS: Record<TradeExitReason, string> = {
  manual: 'Manual',
  stopLoss: 'Stop loss',
  takeProfit: 'Take profit',
  sessionEnd: 'Fin de sesión',
};

/** DecimalPipe format with the decimals that make sense for a price of this size (BTC vs EUR). */
export function priceDigits(price: number): string {
  const decimals = price >= 100 ? 2 : price >= 1 ? 4 : 6;
  return `1.${decimals}-${decimals}`;
}
