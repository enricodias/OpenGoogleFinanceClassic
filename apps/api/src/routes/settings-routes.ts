import type { FastifyInstance } from 'fastify';

import { HttpError } from '../errors/http-error.js';
import { UserRepository } from '../persistence/user-repository.js';
import { SecretCipher } from '../security/secret-cipher.js';
import { AuthService } from '../services/auth-service.js';

interface ProviderCredentialBody {
  apiKey?: unknown;
}

interface ThemeBody {
  theme?: unknown;
}

interface QuoteRefreshIntervalBody {
  seconds?: unknown;
}

const QUOTE_REFRESH_INTERVALS = new Set([60, 120, 300, 600]);

const SUPPORTED_PROVIDER_IDS: ReadonlySet<string> = new Set([
  'finnhub',
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
      quoteRefreshIntervalSeconds: settings.quoteRefreshIntervalSeconds,
      selectedWatchlistId: settings.selectedWatchlistId,
      theme: settings.theme,
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

  server.put('/api/settings/quote-refresh-interval', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    await users.setQuoteRefreshIntervalSeconds(user.id, readQuoteRefreshInterval(request.body));

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
