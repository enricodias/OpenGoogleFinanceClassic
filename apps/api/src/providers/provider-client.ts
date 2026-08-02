import { ProviderError } from '../errors/provider-error.js';

export abstract class ProviderClient {
  protected constructor(
    private readonly providerName: string,
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
      throw new ProviderError('unavailable', `${this.providerName} could not be reached.`);
    }

    if (response.status === 401) {
      throw new ProviderError('invalid-credential', `${this.providerName} rejected the configured API key.`);
    }

    if (response.status === 403) {
      throw new ProviderError(
        'unavailable',
        `${this.providerName} denied a request. Check that the API key and plan include the endpoints used in this page.`,
      );
    }

    if (response.status === 404) {
      throw new ProviderError('not-found', `${this.providerName} could not find the requested market data.`);
    }

    if (response.status === 429) {
      throw new ProviderError('rate-limited', `${this.providerName} rate limit has been reached.`);
    }

    if (!response.ok) {
      throw new ProviderError('unavailable', `${this.providerName} returned an unexpected response.`);
    }

    try {
      return await response.json();
    } catch {
      throw new ProviderError('unavailable', `${this.providerName} returned invalid data.`);
    }
  }
}
