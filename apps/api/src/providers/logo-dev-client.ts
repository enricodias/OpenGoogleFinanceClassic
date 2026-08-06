import { ProviderError } from '../errors/provider-error.js';
import { ProviderClient } from './provider-client.js';

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export class LogoDevClient extends ProviderClient {
  public constructor(
    private readonly apiKey: string,
    baseUrl: string,
    requestTimeoutMs: number,
  ) {
    super('Logo.dev', baseUrl, requestTimeoutMs);
  }

  public async getBrandColor(domain: string): Promise<string | null> {
    let payload: unknown;

    try {
      payload = await this.getJson(`/brand/${encodeURIComponent(domain)}`, {}, {
        Authorization: `Bearer ${this.apiKey}`,
      });
    } catch (error) {
      if (error instanceof ProviderError && error.kind === 'not-found') {
        return null;
      }

      throw error;
    }

    const object = readObject(payload);
    const colors = object.colors;

    if (!Array.isArray(colors) || colors.length === 0) {
      return null;
    }

    const strongest = readObject(colors[1] ?? colors[0]);

    return typeof strongest.hex === 'string' && HEX_PATTERN.test(strongest.hex) ? strongest.hex : null;
  }
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ProviderError('unavailable', 'Logo.dev returned an invalid response.');
}
