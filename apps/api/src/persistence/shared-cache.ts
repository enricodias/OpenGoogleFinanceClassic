import { createHash } from 'node:crypto';

import { getJson, type RedisClient, setJson } from './redis-client.js';

interface CacheEntry<T> {
  data: T;
  expiresAt: string;
  fetchedAt: string;
  staleUntil: string;
}

export interface CachedResult<T> {
  data: T;
  fetchedAt: string;
  isStale: boolean;
}

export class SharedCache {
  private readonly inFlight = new Map<string, Promise<CachedResult<unknown>>>();

  public constructor(private readonly client: RedisClient) {}

  public get redisClient(): RedisClient {
    return this.client;
  }

  public async getOrLoad<T>(
    namespace: string,
    parameters: Record<string, unknown>,
    freshnessSeconds: number,
    staleSeconds: number,
    load: () => Promise<T>,
  ): Promise<CachedResult<T>> {
    const cacheKey = this.cacheKey(namespace, parameters);
    const existing = await this.get<T>(cacheKey);

    if (existing !== null && Date.parse(existing.expiresAt) > Date.now()) {
      return {
        data: existing.data,
        fetchedAt: existing.fetchedAt,
        isStale: false,
      };
    }

    const activeLoad = this.inFlight.get(cacheKey);

    if (activeLoad !== undefined) {
      return activeLoad as Promise<CachedResult<T>>;
    }

    const loadOperation = this.refresh(
      cacheKey,
      existing,
      freshnessSeconds,
      staleSeconds,
      load,
    );
    this.inFlight.set(cacheKey, loadOperation as Promise<CachedResult<unknown>>);

    try {
      return await loadOperation;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private cacheKey(namespace: string, parameters: Record<string, unknown>): string {
    const fingerprint = createHash('sha256')
      .update(`${namespace}:${JSON.stringify(parameters)}`)
      .digest('hex');

    return `market-cache:${fingerprint}`;
  }

  private async get<T>(key: string): Promise<CacheEntry<T> | null> {
    return getJson<CacheEntry<T>>(this.client, key);
  }

  private async refresh<T>(
    key: string,
    existing: CacheEntry<T> | null,
    freshnessSeconds: number,
    staleSeconds: number,
    load: () => Promise<T>,
  ): Promise<CachedResult<T>> {
    try {
      const data = await load();
      const now = new Date();
      const entry: CacheEntry<T> = {
        data,
        expiresAt: new Date(now.getTime() + freshnessSeconds * 1000).toISOString(),
        fetchedAt: now.toISOString(),
        staleUntil: new Date(now.getTime() + (freshnessSeconds + staleSeconds) * 1000).toISOString(),
      };

      await setJson(this.client, key, '$', entry);
      await this.client.expire(key, freshnessSeconds + staleSeconds);

      return {
        data,
        fetchedAt: entry.fetchedAt,
        isStale: false,
      };
    } catch (error) {
      if (existing !== null && Date.parse(existing.staleUntil) > Date.now()) {
        return {
          data: existing.data,
          fetchedAt: existing.fetchedAt,
          isStale: true,
        };
      }

      throw error;
    }
  }
}
