import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';

import type { AppConfig } from './config.js';
import { HttpError } from './errors/http-error.js';
import { MarketGroupRepository } from './persistence/market-group-repository.js';
import { SharedCache } from './persistence/shared-cache.js';
import { UserRepository } from './persistence/user-repository.js';
import { WatchlistRepository } from './persistence/watchlist-repository.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerBackupRoutes } from './routes/backup-routes.js';
import { registerHomeRoutes } from './routes/home-routes.js';
import { registerMarketGroupRoutes } from './routes/market-group-routes.js';
import { registerMarketDataRoutes } from './routes/market-data-routes.js';
import { registerSettingsRoutes } from './routes/settings-routes.js';
import { registerWatchlistRoutes } from './routes/watchlist-routes.js';
import { SecretCipher } from './security/secret-cipher.js';
import { AuthService } from './services/auth-service.js';
import { BackupService } from './services/backup-service.js';
import { HomeService } from './services/home-service.js';
import { MarketDataService } from './services/market-data-service.js';

export async function buildServer(
  config: AppConfig,
  users: UserRepository,
  cache: SharedCache,
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: config.nodeEnvironment === 'production',
  });

  await server.register(cors, {
    origin: false,
  });
  await server.register(cookie);

  if (config.nodeEnvironment === 'production') {
    await server.register(staticPlugin, {
      root: fileURLToPath(new URL('../../web/dist', import.meta.url)),
      wildcard: false,
    });
  }

  const auth = new AuthService(config, users);
  const cipher = new SecretCipher(config.encryptionKey);
  const marketGroups = new MarketGroupRepository(cache.redisClient);
  const watchlists = new WatchlistRepository(cache.redisClient);
  const marketData = new MarketDataService(users, cipher, cache, {
    finnhubBaseUrl: config.finnhubBaseUrl,
    providerRequestTimeoutMs: config.providerRequestTimeoutMs,
    twelveDataBaseUrl: config.twelveDataBaseUrl,
  });
  const home = new HomeService(users, watchlists, marketGroups, marketData);
  const backups = new BackupService(users, watchlists, marketGroups, cipher);

  server.get('/health', async (_request, reply) => {
    try {
      await cache.redisClient.ping();

      return {
        status: 'ok',
      };
    } catch {
      return reply.code(503).send({
        status: 'unavailable',
      });
    }
  });

  registerAuthRoutes(server, auth);
  registerBackupRoutes(server, auth, backups);
  registerHomeRoutes(server, auth, home);
  registerMarketGroupRoutes(server, auth, marketGroups);
  registerMarketDataRoutes(server, auth, marketData);
  registerSettingsRoutes(server, auth, users, cipher);
  registerWatchlistRoutes(server, auth, users, watchlists);

  if (config.nodeEnvironment === 'production') {
    server.get('/assets/*', async (request, reply) => {
      const assetPath = (request.params as { '*': string })['*'];

      return reply.sendFile(assetPath);
    });
    server.get('/*', async (_request, reply) => reply.sendFile('index.html'));
  }

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.message,
      });
    }

    request.log.error(error);

    return reply.code(500).send({
      error: 'An unexpected error occurred.',
    });
  });

  return server;
}
