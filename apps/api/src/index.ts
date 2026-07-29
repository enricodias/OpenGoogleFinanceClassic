import { loadConfig } from './config.js';
import { connectRedis } from './persistence/redis-client.js';
import { SharedCache } from './persistence/shared-cache.js';
import { UserRepository } from './persistence/user-repository.js';
import { buildServer } from './server.js';

const config = loadConfig();
const redis = await connectRedis(config.redisUrl);
const users = new UserRepository(redis);
const cache = new SharedCache(redis);
const server = await buildServer(config, users, cache);

async function shutdown(signal: string): Promise<void> {
  server.log.info({ signal }, 'Shutting down');
  await server.close();
  await redis.quit();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await server.listen({
    host: '0.0.0.0',
    port: config.port,
  });
} catch (error) {
  server.log.error(error);
  await redis.quit();
  process.exit(1);
}
