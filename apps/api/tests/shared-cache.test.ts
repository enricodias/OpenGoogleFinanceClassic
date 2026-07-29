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
});

function createCache(): { cache: SharedCache } {
  const values = new Map<string, unknown>();
  const client = {
    expire: vi.fn(async () => true),
    json: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, _path: string, value: unknown) => values.set(key, value)),
    },
  } as unknown as RedisClient;

  return {
    cache: new SharedCache(client),
  };
}
