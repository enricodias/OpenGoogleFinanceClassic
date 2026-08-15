import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisClient } from '../src/persistence/redis-client.js';
import { SharedCache } from '../src/persistence/shared-cache.js';

describe('SharedCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses fresh normalized data across repeated requests', async () => {
    const { cache } = createCache();
    const load = vi.fn(async () => ({ price: 100 }));

    const first = await cache.getOrLoad('quote', { symbol: 'AAPL' }, 60, 300, load);
    const second = await cache.getOrLoad('quote', { symbol: 'AAPL' }, 60, 300, load);

    expect(first.data).toEqual({ price: 100 });
    expect(second.isStale).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('returns stale data when a refresh fails within the grace period', async () => {
    const { cache } = createCache();
    await cache.getOrLoad('quote', { symbol: 'AAPL' }, 60, 300, async () => ({ price: 100 }));
    vi.setSystemTime(new Date('2026-07-27T12:01:01.000Z'));

    const result = await cache.getOrLoad(
      'quote',
      { symbol: 'AAPL' },
      60,
      300,
      async () => Promise.reject(new Error('Provider unavailable')),
    );

    expect(result).toMatchObject({
      data: { price: 100 },
      isStale: true,
    });
  });

  it('clears cached entries so subsequent reads reload from the source', async () => {
    const { cache } = createCache();
    const load = vi.fn(async () => ({ price: 100 }));
    await cache.getOrLoad('quote', { symbol: 'AAPL' }, 60, 300, load);

    await cache.clear();
    await cache.getOrLoad('quote', { symbol: 'AAPL' }, 60, 300, load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not issue a delete when there is nothing cached', async () => {
    const { cache, client } = createCache();

    await cache.clear();

    expect(client.del).not.toHaveBeenCalled();
  });
});

function createCache(): { cache: SharedCache; client: RedisClient } {
  const values = new Map<string, unknown>();
  const client = {
    del: vi.fn(async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      let deleted = 0;

      for (const key of keyList) {
        if (values.delete(key)) {
          deleted += 1;
        }
      }

      return deleted;
    }),
    expire: vi.fn(async () => true),
    json: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, _path: string, value: unknown) => values.set(key, value)),
    },
    scanIterator: vi.fn(({ MATCH }: { MATCH: string }) => {
      const pattern = new RegExp(`^${MATCH.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      const matches = [...values.keys()].filter((key) => pattern.test(key));

      return (async function* iterate() {
        for (const key of matches) {
          yield key;
        }
      })();
    }),
  } as unknown as RedisClient;

  return {
    cache: new SharedCache(client),
    client,
  };
}
