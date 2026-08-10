import type { FastifyInstance } from 'fastify';

import type { WatchlistSortColumn, WatchlistSortDirection } from '../domain/user.js';
import { HttpError } from '../errors/http-error.js';
import { UserRepository } from '../persistence/user-repository.js';
import { SecretCipher } from '../security/secret-cipher.js';
import { AuthService } from '../services/auth-service.js';

const WATCHLIST_SORT_COLUMNS: ReadonlySet<string> = new Set(['change', 'name', 'percentChange', 'price']);

interface ProviderCredentialBody {
  apiKey?: unknown;
}

interface ThemeBody {
  theme?: unknown;
}

interface QuoteRefreshIntervalBody {
  seconds?: unknown;
}

interface WatchlistSortBody {
  column?: unknown;
  direction?: unknown;
}

const QUOTE_REFRESH_INTERVALS = new Set([60, 120, 300, 600]);

const SUPPORTED_PROVIDER_IDS: ReadonlySet<string> = new Set([
  'finnhub',
  'logo-dev',
  'massive',
  'twelve-data',
]);

export function registerSettingsRoutes(
  server: FastifyInstance,
  auth: AuthService,
  users: UserRepository,
  cipher: SecretCipher,
): void {
  server.get('/api/settings', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const settings = await users.getSettings(user.id);

    return {
      configuredProviders: Object.keys(settings.providerCredentials).sort(),
      dateFormat: settings.dateFormat,
      quoteRefreshIntervalSeconds: settings.quoteRefreshIntervalSeconds,
      selectedWatchlistId: settings.selectedWatchlistId,
      theme: settings.theme,
      watchlistSortColumn: settings.watchlistSortColumn,
      watchlistSortDirection: settings.watchlistSortDirection,
    };
  });

  server.put('/api/settings/providers/:providerId', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const providerId = readProviderId(request.params as { providerId?: unknown });
    const body = request.body as ProviderCredentialBody;
    const apiKey = readApiKey(body);
    const encryptedCredential = cipher.encrypt(user.id, providerId, apiKey);

    await users.setProviderCredential(user.id, providerId, encryptedCredential);

    return {
      configured: true,
      providerId,
    };
  });

  server.put('/api/settings/theme', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const theme = readTheme(request.body);

    await users.setTheme(user.id, theme);

    return reply.code(204).send();
  });

  server.put('/api/settings/date-format', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    await users.setDateFormat(user.id, readDateFormat(request.body));

    return reply.code(204).send();
  });

  server.put('/api/settings/quote-refresh-interval', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    await users.setQuoteRefreshIntervalSeconds(user.id, readQuoteRefreshInterval(request.body));

    return reply.code(204).send();
  });

  server.put('/api/settings/watchlist-sort', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const { column, direction } = readWatchlistSort(request.body);
    await users.setWatchlistSort(user.id, column, direction);

    return reply.code(204).send();
  });

  server.delete('/api/settings/providers/:providerId', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const providerId = readProviderId(request.params as { providerId?: unknown });

    await users.removeProviderCredential(user.id, providerId);

    return reply.code(204).send();
  });
}

function readApiKey(body: ProviderCredentialBody): string {
  if (typeof body.apiKey !== 'string' || body.apiKey.trim().length === 0) {
    throw new HttpError(400, 'API key is required.');
  }

  return body.apiKey.trim();
}

function readProviderId(params: { providerId?: unknown }): string {
  if (typeof params.providerId !== 'string' || !SUPPORTED_PROVIDER_IDS.has(params.providerId)) {
    throw new HttpError(400, 'Provider ID is invalid.');
  }

  return params.providerId;
}

function readTheme(body: unknown): 'dark' | 'light' | 'system' {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Theme is required.');
  }

  const theme = (body as ThemeBody).theme;

  if (theme === 'dark' || theme === 'light' || theme === 'system') {
    return theme;
  }

  throw new HttpError(400, 'Theme is invalid.');
}

function readDateFormat(body: unknown): 'dd/mm/yyyy' | 'mm/dd/yyyy' {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Date format is required.');
  }

  const dateFormat = (body as { dateFormat?: unknown }).dateFormat;

  if (dateFormat === 'dd/mm/yyyy' || dateFormat === 'mm/dd/yyyy') {
    return dateFormat;
  }

  throw new HttpError(400, 'Date format is invalid.');
}

function readWatchlistSort(body: unknown): { column: WatchlistSortColumn | null; direction: WatchlistSortDirection } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Watchlist sort is required.');
  }

  const { column, direction } = body as WatchlistSortBody;

  if (column !== null && (typeof column !== 'string' || !WATCHLIST_SORT_COLUMNS.has(column))) {
    throw new HttpError(400, 'Watchlist sort column is invalid.');
  }

  if (direction !== 'asc' && direction !== 'desc') {
    throw new HttpError(400, 'Watchlist sort direction is invalid.');
  }

  return { column: column as WatchlistSortColumn | null, direction };
}

function readQuoteRefreshInterval(body: unknown): number {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Quote refresh interval is required.');
  }

  const seconds = (body as QuoteRefreshIntervalBody).seconds;

  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || !QUOTE_REFRESH_INTERVALS.has(seconds)) {
    throw new HttpError(400, 'Quote refresh interval is invalid.');
  }

  return seconds;
}
