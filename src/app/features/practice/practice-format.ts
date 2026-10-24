// Names of order types, sides and exit reasons are translated: see `trading` in
// core/i18n/messages.

/** Lots with two decimals, as brokers size gold orders: "0.05". */
export function formatLots(lots: number): string {
  return lots.toFixed(2);
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

const SIGNED = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

/** Money with its sign, as trading platforms show P/L: "+1,250.00", "-3.10", "0.00". */
export function signedMoney(value: number): string {
  return SIGNED.format(value);
}
