// Copies economic news from Finance Calendar (financecalendar.com, free account, commercial use
// allowed with a visible link to it) into Firestore `marketNews/{YYYY-MM}`, where the practice
// chart reads it. Run daily by .github/workflows/news-sync.yml; Node strips the types.
//
//   FINANCE_CALENDAR_API_KEY   the free account's API key
//   FIREBASE_SERVICE_ACCOUNT   service account JSON with the "Cloud Datastore User" role
//   NEWS_FROM, NEWS_TO         optional months (YYYY-MM); default: last month to next month
//   NEWS_DRY_RUN=1             prints what it would write instead of writing
//
// Each month is read whole and its document replaced, so corrections and released figures
// (actual) reach the chart. One request per month and page: far under the free 250 a day.
import { createSign } from 'node:crypto';
import {
  type NewsEvent,
  monthKey,
  monthRange,
  monthsBetween,
  toNewsEvent,
} from '../src/app/core/models/market-news.ts';

const API = 'https://www.financecalendar.com/wp-json/fc/v1';
const PROJECT = 'indab-academy';
const PAGE = 500;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function monthOffset(offset: number): string {
  const now = new Date();
  return monthKey(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1) / 1000);
}

function monthStart(month: string): number {
  return Date.parse(`${month}-01T00:00:00Z`) / 1000;
}

async function fetchMonth(month: string, key: string): Promise<NewsEvent[]> {
  const { from, to } = monthRange(month);
  const events = new Map<string, NewsEvent>();
  for (let offset = 0; offset < 10_000; offset += PAGE) {
    const url = new URL(`${API}/calendar`);
    url.search = new URLSearchParams({
      from,
      to,
      country: 'us',
      limit: String(PAGE),
      offset: String(offset),
    }).toString();
    const response = await fetch(url, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(
        `Finance Calendar ${month} answered ${response.status}: ${await response.text()}`,
      );
    }
    const body = (await response.json()) as { events?: Record<string, unknown>[]; total?: number };
    const page = body.events ?? [];
    for (const raw of page) {
      const event = toNewsEvent(raw);
      // Only what falls in the month: the document is named by it.
      if (event && monthKey(event.time) === month) {
        events.set(event.id, event);
      }
    }
    if (page.length < PAGE || offset + PAGE >= (body.total ?? 0)) {
      break;
    }
  }
  return [...events.values()].sort((a, b) => a.time - b.time || a.name.localeCompare(b.name));
}

/** An OAuth access token for the service account (signed JWT, no extra packages). */
async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(account.private_key, 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token answered ${response.status}: ${await response.text()}`);
  }
  return ((await response.json()) as { access_token: string }).access_token;
}

/** A value in Firestore's REST format. */
function toValue(value: unknown): object {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toValue) } };
  }
  return { mapValue: { fields: toFields(value as Record<string, unknown>) } };
}

function toFields(data: Record<string, unknown>): Record<string, object> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)]));
}

async function writeMonth(month: string, events: NewsEvent[], token: string): Promise<void> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)` +
    `/documents/marketNews/${month}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        ...toFields({ month, events, source: 'financecalendar.com' }),
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Firestore ${month} answered ${response.status}: ${await response.text()}`);
  }
}

async function main(): Promise<void> {
  const key = env('FINANCE_CALENDAR_API_KEY');
  const dryRun = process.env['NEWS_DRY_RUN'] === '1';
  const from = process.env['NEWS_FROM']?.trim() || monthOffset(-1);
  const to = process.env['NEWS_TO']?.trim() || monthOffset(1);
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
    throw new Error('NEWS_FROM and NEWS_TO are months like 2026-01');
  }
  const months = monthsBetween(monthStart(from), monthStart(to));
  const token = dryRun
    ? ''
    : await accessToken(JSON.parse(env('FIREBASE_SERVICE_ACCOUNT')) as ServiceAccount);
  for (const month of months) {
    const events = await fetchMonth(month, key);
    if (dryRun) {
      console.log(month, JSON.stringify(events, null, 2));
    } else {
      await writeMonth(month, events, token);
    }
    console.log(`${month}: ${events.length} releases`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
