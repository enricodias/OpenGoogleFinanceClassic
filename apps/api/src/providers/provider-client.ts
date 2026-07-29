import { ProviderError } from '../errors/provider-error.js';

export abstract class ProviderClient {
  protected constructor(
    private readonly baseUrl: string,
    private readonly requestTimeoutMs: number,
  ) {}

  protected async getJson(path: string, parameters: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`);

    for (const [name, value] of Object.entries(parameters)) {
      url.searchParams.set(name, value);
    }

    let response: Response;

    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch {
      throw new ProviderError('unavailable', 'The market-data provider could not be reached.');
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('invalid-credential', 'The configured provider credential was rejected.');
    }

    if (response.status === 404) {
      throw new ProviderError('not-found', 'The requested market data could not be found.');
    }

    if (response.status === 429) {
      throw new ProviderError('rate-limited', 'The provider rate limit has been reached.');
    }

    if (!response.ok) {
      throw new ProviderError('unavailable', 'The market-data provider returned an unexpected response.');
    }

    try {
      return await response.json();
    } catch {
      throw new ProviderError('unavailable', 'The market-data provider returned invalid data.');
    }
  }
}
