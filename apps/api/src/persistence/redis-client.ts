import { createClient } from 'redis';

export type RedisClient = ReturnType<typeof createClient>;

export async function connectRedis(redisUrl: string): Promise<RedisClient> {
  const client = createClient({
    url: redisUrl,
  });

  client.on('error', (error: Error) => {
    console.error('Redis client error', error);
  });

  await client.connect();

  return client;
}

export async function getJson<T>(client: RedisClient, key: string): Promise<T | null> {
  const value = await client.json.get(key);

  if (value === null) {
    return null;
  }

  return value as unknown as T;
}

export async function setJson(
  client: RedisClient,
  key: string,
  path: string,
  value: unknown,
): Promise<void> {
  await client.json.set(key, path, value as never);
}
