import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

const encryptionKey = Buffer.alloc(32, 1).toString('base64');

describe('loadConfig', () => {
  it('loads valid production settings', () => {
    const config = loadConfig({
      ALLOW_REGISTRATION: 'true',
      APP_ENCRYPTION_KEY: encryptionKey,
      AUTH_MODE: 'required',
      COOKIE_SECURE: 'true',
      FINNHUB_BASE_URL: 'https://finnhub.example/api/v1',
      NODE_ENV: 'production',
      PORT: '9443',
      PROVIDER_REQUEST_TIMEOUT_MS: '15000',
      REDIS_URL: 'redis://redis.example:6379',
      SESSION_TTL_SECONDS: '3600',
      TWELVE_DATA_BASE_URL: 'https://twelve.example',
    });

    expect(config).toMatchObject({
      allowRegistration: true,
      authenticationMode: 'required',
      finnhubBaseUrl: 'https://finnhub.example/api/v1',
      port: 9443,
      providerRequestTimeoutMs: 15000,
      redisUrl: 'redis://redis.example:6379',
      sessionTtlSeconds: 3600,
      twelveDataBaseUrl: 'https://twelve.example',
      useSecureCookies: true,
    });
  });

  it('rejects an encryption key with the wrong length', () => {
    expect(() => loadConfig({
      APP_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64'),
    })).toThrow('APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  });
});
