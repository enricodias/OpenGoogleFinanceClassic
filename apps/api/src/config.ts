export type AuthenticationMode = 'disabled' | 'required';

export interface AppConfig {
  authenticationMode: AuthenticationMode;
  allowRegistration: boolean;
  encryptionKey: Buffer;
  finnhubBaseUrl: string;
  nodeEnvironment: string;
  port: number;
  providerRequestTimeoutMs: number;
  redisUrl: string;
  sessionTtlSeconds: number;
  twelveDataBaseUrl: string;
  useSecureCookies: boolean;
}

const AUTHENTICATION_MODES: ReadonlySet<string> = new Set([
  'disabled',
  'required',
]);

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const authenticationMode = environment.AUTH_MODE ?? 'disabled';
  const port = Number(environment.PORT ?? '3000');
  const providerRequestTimeoutMs = Number(environment.PROVIDER_REQUEST_TIMEOUT_MS ?? '10000');
  const sessionTtlSeconds = Number(environment.SESSION_TTL_SECONDS ?? '1209600');
  const encryptionKey = readEncryptionKey(environment.APP_ENCRYPTION_KEY);

  if (!AUTHENTICATION_MODES.has(authenticationMode)) {
    throw new Error('AUTH_MODE must be either disabled or required.');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  if (!Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds < 300) {
    throw new Error('SESSION_TTL_SECONDS must be an integer of at least 300.');
  }

  if (!Number.isInteger(providerRequestTimeoutMs) || providerRequestTimeoutMs < 1000) {
    throw new Error('PROVIDER_REQUEST_TIMEOUT_MS must be an integer of at least 1000.');
  }

  return {
    authenticationMode: authenticationMode as AuthenticationMode,
    allowRegistration: environment.ALLOW_REGISTRATION === 'true',
    encryptionKey,
    finnhubBaseUrl: environment.FINNHUB_BASE_URL ?? 'https://finnhub.io/api/v1',
    nodeEnvironment: environment.NODE_ENV ?? 'development',
    port,
    providerRequestTimeoutMs,
    redisUrl: environment.REDIS_URL ?? 'redis://localhost:6379',
    sessionTtlSeconds,
    twelveDataBaseUrl: environment.TWELVE_DATA_BASE_URL ?? 'https://api.twelvedata.com',
    useSecureCookies: environment.COOKIE_SECURE === 'true',
  };
}

function readEncryptionKey(value: string | undefined): Buffer {
  if (value === undefined) {
    throw new Error('APP_ENCRYPTION_KEY must be configured.');
  }

  const encryptionKey = Buffer.from(value, 'base64');

  if (encryptionKey.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }

  return encryptionKey;
}
