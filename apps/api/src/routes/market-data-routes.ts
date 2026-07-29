import type { FastifyInstance } from 'fastify';

import { HttpError } from '../errors/http-error.js';
import { AuthService } from '../services/auth-service.js';
import { MarketDataService, toHttpError } from '../services/market-data-service.js';

const CHART_INTERVALS: ReadonlySet<string> = new Set([
  '1min',
  '5min',
  '15min',
  '30min',
  '1h',
  '4h',
  '1day',
  '1week',
  '1month',
]);
const NEWS_CATEGORIES: ReadonlySet<string> = new Set([
  'crypto',
  'forex',
  'general',
  'merger',
]);

export function registerMarketDataRoutes(
  server: FastifyInstance,
  auth: AuthService,
  marketData: MarketDataService,
): void {
  server.get('/api/market/search', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const query = readQueryString(request.query, 'q');

    return withProviderError(() => marketData.search(user.id, query));
  });

  server.get('/api/market/quote', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const symbol = readQueryString(request.query, 'symbol');

    return withProviderError(() => marketData.getQuote(user.id, symbol));
  });

  server.get('/api/market/chart', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const symbol = readQueryString(request.query, 'symbol');
    const interval = readChartInterval(request.query);
    const outputsize = readOutputsize(request.query);

    return withProviderError(() => marketData.getChart(user.id, symbol, interval, outputsize));
  });

  server.get('/api/market/profile', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const symbol = readQueryString(request.query, 'symbol');

    return withProviderError(() => marketData.getProfile(user.id, symbol));
  });

  server.get('/api/market/earnings', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const symbol = readQueryString(request.query, 'symbol');

    return withProviderError(() => marketData.getEarnings(user.id, symbol));
  });

  server.get('/api/market/earnings-calendar', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const from = readDate(request.query, 'from', today());
    const to = readDate(request.query, 'to', daysAhead(7));

    return withProviderError(() => marketData.getEarningsCalendar(user.id, from, to));
  });

  server.get('/api/market/news', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const category = readNewsCategory(request.query);

    return withProviderError(() => marketData.getGeneralNews(user.id, category));
  });

  server.get('/api/market/company-news', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const symbol = readQueryString(request.query, 'symbol');
    const from = readDate(request.query, 'from', daysAgo(7));
    const to = readDate(request.query, 'to', today());

    return withProviderError(() => marketData.getCompanyNews(user.id, symbol, from, to));
  });
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 10);
}

function daysAhead(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function readChartInterval(query: unknown): string {
  const interval = readQueryString(query, 'interval');

  if (!CHART_INTERVALS.has(interval)) {
    throw new HttpError(400, 'The chart interval is invalid.');
  }

  return interval;
}

function readDate(query: unknown, name: string, fallback: string): string {
  const value = readOptionalQueryString(query, name);

  if (value === null) {
    return fallback;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${name} must use YYYY-MM-DD format.`);
  }

  return value;
}

function readNewsCategory(query: unknown): string {
  const category = readOptionalQueryString(query, 'category') ?? 'general';

  if (!NEWS_CATEGORIES.has(category)) {
    throw new HttpError(400, 'The news category is invalid.');
  }

  return category;
}

function readOptionalQueryString(query: unknown, name: string): string | null {
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    return null;
  }

  const value = (query as Record<string, unknown>)[name];

  if (typeof value === 'string') {
    return value.trim();
  }

  return null;
}

function readOutputsize(query: unknown): number {
  const value = readOptionalQueryString(query, 'outputsize') ?? '300';
  const outputsize = Number(value);

  if (!Number.isInteger(outputsize) || outputsize < 1 || outputsize > 5000) {
    throw new HttpError(400, 'outputsize must be an integer between 1 and 5000.');
  }

  return outputsize;
}

function readQueryString(query: unknown, name: string): string {
  const value = readOptionalQueryString(query, name);

  if (value === null || value.length === 0 || value.length > 128) {
    throw new HttpError(400, `${name} is required and must contain at most 128 characters.`);
  }

  return value;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function withProviderError<T>(callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    return toHttpError(error);
  }
}
