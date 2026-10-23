// Downloads the historical candles used by the trading practice (/academy/practice) from
// Dukascopy's free historical data feed and writes them as static JSON under
// public/market-data/, which Firebase Hosting serves with the app.
//
//   node scripts/fetch-market-data.mjs
//
// Runs in GitHub Actions ("Market data" workflow), since it needs open internet access and a
// Chromium for Dukascopy's bot check (CHROME_PATH, optional). Output:
//   public/market-data/index.json                   instruments, timeframes and their files
//   public/market-data/<SYMBOL>/<interval>/<name>.json   [[timeSeconds, open, high, low, close], ...]
import { getHistoricalRates } from 'dukascopy-node';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'public', 'market-data');

// symbol: id used by the app and stored in Firestore; id: Dukascopy instrument.
const INSTRUMENTS = [
  { symbol: 'XAUUSD', id: 'xauusd', decimals: 2 },
  { symbol: 'USDJPY', id: 'usdjpy', decimals: 3 },
  { symbol: 'NAS100', id: 'usatechidxusd', decimals: 1 },
];

// years: how much history to keep. Intraday series are split into one file per year so the
// app only downloads the part a replay needs.
const TIMEFRAMES = [
  { interval: '15m', timeframe: 'm15', years: 1, split: true },
  { interval: '1h', timeframe: 'h1', years: 6, split: true },
  { interval: '4h', timeframe: 'h4', years: 10, split: false },
  { interval: '1d', timeframe: 'd1', years: 12, split: false },
];

const DAY = 86_400_000;

async function fetchCandles(instrument, timeframe, from, to) {
  const rows = await getHistoricalRates({
    instrument: instrument.id,
    dates: { from, to },
    timeframe,
    priceType: 'bid',
    volumes: false,
    ignoreFlats: true,
    format: 'array',
    batchSize: 10,
    pauseBetweenBatchesMs: 500,
    retryCount: 3,
    pauseBetweenRetriesMs: 2000,
    wafMode: 'auto',
    chromePath: process.env.CHROME_PATH || undefined,
  });
  const round = (n) => Number(n.toFixed(instrument.decimals));
  return rows.map(([t, o, h, l, c]) => [
    Math.floor(t / 1000),
    round(o),
    round(h),
    round(l),
    round(c),
  ]);
}

/** Splits [from, to) into calendar-year ranges. */
function yearRanges(from, to) {
  const ranges = [];
  for (let year = from.getUTCFullYear(); year <= to.getUTCFullYear(); year++) {
    const start = new Date(Math.max(from.getTime(), Date.UTC(year, 0, 1)));
    const end = new Date(Math.min(to.getTime(), Date.UTC(year + 1, 0, 1)));
    if (start < end) ranges.push({ name: String(year), from: start, to: end });
  }
  return ranges;
}

async function main() {
  // Stop at the start of today (UTC) so every candle is complete.
  const to = new Date(Math.floor(Date.now() / DAY) * DAY);
  const index = {
    source: 'Dukascopy historical data feed (bid prices, UTC)',
    generatedAt: new Date().toISOString(),
    instruments: {},
  };
  await rm(OUT, { recursive: true, force: true });

  for (const instrument of INSTRUMENTS) {
    index.instruments[instrument.symbol] = {};
    for (const tf of TIMEFRAMES) {
      const from = new Date(to.getTime() - tf.years * 365 * DAY);
      const ranges = tf.split ? yearRanges(from, to) : [{ name: 'all', from, to }];
      const files = [];
      for (const range of ranges) {
        const candles = await fetchCandles(instrument, tf.timeframe, range.from, range.to);
        if (!candles.length) continue;
        const file = `${instrument.symbol}/${tf.interval}/${range.name}.json`;
        await mkdir(join(OUT, instrument.symbol, tf.interval), { recursive: true });
        await writeFile(join(OUT, file), JSON.stringify(candles));
        files.push({ file, count: candles.length, from: candles[0][0], to: candles.at(-1)[0] });
        console.log(`${file}: ${candles.length} candles`);
      }
      if (!files.length) {
        throw new Error(`No data for ${instrument.symbol} ${tf.interval}`);
      }
      index.instruments[instrument.symbol][tf.interval] = files;
    }
  }
  await writeFile(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
}

await main();
