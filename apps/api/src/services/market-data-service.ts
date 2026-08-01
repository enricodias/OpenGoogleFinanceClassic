import type {
  ChartPoint,
  CompanyProfile,
  EarningsRecord,
  FinnhubEarningsCalendarEntry,
  InstrumentSearchResult,
  MarketQuote,
  NewsArticle,
} from '../domain/market.js';
import { HttpError } from '../errors/http-error.js';
import { ProviderError } from '../errors/provider-error.js';
import { SharedCache, type CachedResult } from '../persistence/shared-cache.js';
import { UserRepository } from '../persistence/user-repository.js';
import { FinnhubClient } from '../providers/finnhub-client.js';
import { TwelveDataClient } from '../providers/twelve-data-client.js';
import { SecretCipher } from '../security/secret-cipher.js';

interface MarketDataServiceOptions {
  finnhubBaseUrl: string;
  providerRequestTimeoutMs: number;
  twelveDataBaseUrl: string;
}

export class MarketDataService {
  public constructor(
    private readonly users: UserRepository,
    private readonly cipher: SecretCipher,
    private readonly cache: SharedCache,
    private readonly options: MarketDataServiceOptions,
  ) {}

  public async getChart(
    userId: string,
    symbol: string,
    interval: string,
    outputsize: number,
  ): Promise<CachedResult<ChartPoint[]>> {
    const freshnessSeconds = interval.endsWith('min') ? 60 : 43200;
    const client = await this.twelveDataClient(userId);

    return this.cache.getOrLoad(
      'twelve-data:chart',
      { interval, outputsize, symbol },
      freshnessSeconds,
      3600,
      async () => client.getChart(symbol, interval, outputsize),
    );
  }

  public async getCompanyNews(
    userId: string,
    symbol: string,
    from: string,
    to: string,
  ): Promise<CachedResult<NewsArticle[]>> {
    const client = await this.finnhubClient(userId);

    return this.cache.getOrLoad(
      'finnhub:company-news',
      { from, symbol, to },
      600,
      3600,
      async () => client.getCompanyNews(symbol, from, to),
    );
  }

  public async getEarnings(userId: string, symbol: string): Promise<CachedResult<EarningsRecord[]>> {
    const client = await this.finnhubClient(userId);

    return this.cache.getOrLoad(
      'finnhub:earnings',
      { symbol },
      21600,
      86400,
      async () => client.getEarnings(symbol),
    );
  }

  public async getEarningsCalendar(
    userId: string,
    from: string,
    to: string,
    symbol: string | null = null,
  ): Promise<CachedResult<FinnhubEarningsCalendarEntry[]>> {
    const client = await this.finnhubClient(userId);

    return this.cache.getOrLoad(
      'finnhub:earnings-calendar',
      { from, symbol, to },
      900,
      3600,
      async () => client.getEarningsCalendar(from, to, symbol),
    );
  }

  public async getGeneralNews(userId: string, category: string): Promise<CachedResult<NewsArticle[]>> {
    const client = await this.finnhubClient(userId);

    return this.cache.getOrLoad(
      'finnhub:general-news',
      { category },
      600,
      3600,
      async () => client.getGeneralNews(category),
    );
  }

  public async getProfile(userId: string, symbol: string): Promise<CachedResult<CompanyProfile>> {
    const client = await this.twelveDataClient(userId);

    return this.cache.getOrLoad(
      'twelve-data:profile',
      { symbol },
      86400,
      604800,
      async () => client.getProfile(symbol),
    );
  }

  public async getQuote(userId: string, symbol: string): Promise<CachedResult<MarketQuote>> {
    const settings = await this.users.getSettings(userId);
    const client = await this.twelveDataClient(userId);

    return this.cache.getOrLoad(
      'twelve-data:quote',
      { symbol, userId },
      settings.quoteRefreshIntervalSeconds,
      300,
      async () => client.getQuote(symbol),
    );
  }

  public async search(userId: string, query: string): Promise<CachedResult<InstrumentSearchResult[]>> {
    const client = await this.twelveDataClient(userId);

    return this.cache.getOrLoad(
      'twelve-data:search',
      { query },
      86400,
      604800,
      async () => client.search(query),
    );
  }

  private async finnhubClient(userId: string): Promise<FinnhubClient> {
    const apiKey = await this.getApiKey(userId, 'finnhub');

    return new FinnhubClient(
      apiKey,
      this.options.finnhubBaseUrl,
      this.options.providerRequestTimeoutMs,
    );
  }

  private async getApiKey(userId: string, providerId: string): Promise<string> {
    const settings = await this.users.getSettings(userId);
    const credential = settings.providerCredentials[providerId];

    if (credential === undefined) {
      throw new HttpError(409, `A ${providerId} API key must be configured first.`);
    }

    try {
      return this.cipher.decrypt(userId, providerId, credential);
    } catch {
      throw new HttpError(409, `The stored ${providerId} API key cannot be decrypted.`);
    }
  }

  private async twelveDataClient(userId: string): Promise<TwelveDataClient> {
    const apiKey = await this.getApiKey(userId, 'twelve-data');

    return new TwelveDataClient(
      apiKey,
      this.options.twelveDataBaseUrl,
      this.options.providerRequestTimeoutMs,
    );
  }
}

export function toHttpError(error: unknown): never {
  if (!(error instanceof ProviderError)) {
    throw error;
  }

  if (error.kind === 'invalid-credential') {
    throw new HttpError(424, error.message);
  }

  if (error.kind === 'not-found') {
    throw new HttpError(404, error.message);
  }

  if (error.kind === 'rate-limited') {
    throw new HttpError(429, error.message);
  }

  throw new HttpError(503, error.message);
}
