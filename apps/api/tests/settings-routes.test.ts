import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import type { AppConfig } from '../src/config.js';
import type { RedisClient } from '../src/persistence/redis-client.js';
import { SharedCache } from '../src/persistence/shared-cache.js';
import { UserRepository } from '../src/persistence/user-repository.js';
import { buildServer } from '../src/server.js';

const SESSION_COOKIE_NAME = 'open_finance_session';

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    allowRegistration: true,
    authenticationMode: 'required',
    encryptionKey: Buffer.alloc(32, 7),
    finnhubBaseUrl: 'https://finnhub.example',
    logoDevBaseUrl: 'https://logo.example',
    massiveBaseUrl: 'https://massive.example',
    nodeEnvironment: 'test',
    port: 4000,
    providerRequestTimeoutMs: 5000,
    redisUrl: 'redis://localhost:6379',
    sessionTtlSeconds: 3600,
    twelveDataBaseUrl: 'https://twelve.example',
    useSecureCookies: false,
    ...overrides,
  };
}

function createRedisClient(): RedisClient {
  const values = new Map<string, unknown>();

  return {
    del: async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      let deleted = 0;

      for (const key of keyList) {
        if (values.delete(key)) {
          deleted += 1;
        }
      }

      return deleted;
    },
    expire: async () => true,
    get: async (key: string) => (values.has(key) ? values.get(key) as string : null),
    json: {
      get: async (key: string) => (values.has(key) ? values.get(key) : null),
      set: async (key: string, path: string, value: unknown) => {
        if (path === '$') {
          values.set(key, value);

          return;
        }

        const existing = values.get(key) as Record<string, unknown> | undefined;

        if (existing === undefined) {
          return;
        }

        existing[path.replace(/^\$\./, '')] = value;
        values.set(key, existing);
      },
    },
    scanIterator: ({ MATCH }: { MATCH: string }) => {
      const pattern = new RegExp(`^${MATCH.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      const matches = [...values.keys()].filter((key) => pattern.test(key));

      return (async function* iterate() {
        for (const key of matches) {
          yield key;
        }
      })();
    },
    set: async (key: string, value: string, options?: { NX?: boolean }) => {
      if (options?.NX === true && values.has(key)) {
        return null;
      }

      values.set(key, value);

      return 'OK';
    },
  } as unknown as RedisClient;
}

async function buildTestServer(configOverrides: Partial<AppConfig> = {}): Promise<FastifyInstance> {
  const redis = createRedisClient();
  const users = new UserRepository(redis);
  const cache = new SharedCache(redis);

  return buildServer(buildConfig(configOverrides), users, cache);
}

describe('POST /api/settings/cache/clear', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server.close();
  });

  it('rejects unauthenticated requests', async () => {
    server = await buildTestServer();

    const response = await server.inject({ method: 'POST', url: '/api/settings/cache/clear' });

    expect(response.statusCode).toBe(401);
  });

  it('rejects clearing the cache when authentication is required, even for a logged in user', async () => {
    server = await buildTestServer({ authenticationMode: 'required' });

    const register = await server.inject({
      method: 'POST',
      payload: { password: 'a-very-secure-password', username: 'trader1' },
      url: '/api/auth/register',
    });
    const sessionCookie = register.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();

    const response = await server.inject({
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie?.value ?? '' },
      method: 'POST',
      url: '/api/settings/cache/clear',
    });

    expect(response.statusCode).toBe(403);
  });

  it('clears the cache when authentication is disabled, without touching the persisted local user', async () => {
    server = await buildTestServer({ authenticationMode: 'disabled' });

    const sessionBefore = await server.inject({ method: 'GET', url: '/api/auth/session' });
    expect(sessionBefore.json()).toMatchObject({ authenticated: true });

    const response = await server.inject({ method: 'POST', url: '/api/settings/cache/clear' });
    expect(response.statusCode).toBe(204);

    const sessionAfter = await server.inject({ method: 'GET', url: '/api/auth/session' });
    expect(sessionAfter.json()).toMatchObject({ authenticated: true });
  });
});
