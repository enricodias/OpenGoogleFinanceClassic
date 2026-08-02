import type { CompanySnapshot, EarningsRecord, FinnhubEarningsCalendarEntry, NewsArticle } from '../domain/market.js';
import { ProviderError } from '../errors/provider-error.js';
import { ProviderClient } from './provider-client.js';

export class FinnhubClient extends ProviderClient {
  public constructor(
    private readonly apiKey: string,
    baseUrl: string,
    requestTimeoutMs: number,
  ) {
    super('Finnhub', baseUrl, requestTimeoutMs);
  }

  public async getCompanyNews(symbol: string, from: string, to: string): Promise<NewsArticle[]> {
    const payload = await this.request('/company-news', { from, symbol, to });

    return this.toNewsArticles(payload);
  }

  public async getCompanyProfile(symbol: string): Promise<CompanySnapshot> {
    const payload = readObject(await this.request('/stock/profile2', { symbol }));

    return {
      marketCapitalization: readOptionalNumber(payload.marketCapitalization),
      website: readOptionalString(payload.weburl),
    };
  }

  public async getEarningsCalendar(
    from: string,
    to: string,
    symbol: string | null = null,
  ): Promise<FinnhubEarningsCalendarEntry[]> {
    const parameters: Record<string, string> = { from, to };

    if (symbol !== null) {
      parameters.symbol = symbol;
    }

    const payload = readObject(await this.request('/calendar/earnings', parameters));
    const calendar = payload.earningsCalendar;

    if (!Array.isArray(calendar)) {
      throw new ProviderError('unavailable', 'Finnhub returned an invalid earnings calendar response.');
    }

    return calendar.map((value) => {
      const entry = readObject(value);

      return {
        actualEarningsPerShare: readOptionalNumber(entry.epsActual),
        actualRevenue: readOptionalNumber(entry.revenueActual),
        estimatedEarningsPerShare: readOptionalNumber(entry.epsEstimate),
        estimatedRevenue: readOptionalNumber(entry.revenueEstimate),
        quarter: readOptionalNumber(entry.quarter),
        releaseDate: readString(entry.date),
        releaseTime: readOptionalString(entry.hour),
        symbol: readString(entry.symbol),
        year: readOptionalNumber(entry.year),
      };
    });
  }

  public async getEarnings(symbol: string): Promise<EarningsRecord[]> {
    const earnings = await this.request('/stock/earnings', { symbol });

    if (!Array.isArray(earnings)) {
      throw new ProviderError('unavailable', 'Finnhub returned an invalid earnings response.');
    }

    return earnings.map((value) => {
      const entry = readObject(value);

      return {
        actualEarningsPerShare: readOptionalNumber(entry.actual),
        actualRevenue: readOptionalNumber(entry.revenueActual),
        estimatedEarningsPerShare: readOptionalNumber(entry.estimate),
        estimatedRevenue: readOptionalNumber(entry.revenueEstimate),
        quarter: readOptionalNumber(entry.quarter),
        releaseDate: readString(entry.period),
        releaseTime: null,
        surprisePercent: readOptionalNumber(entry.surprisePercent),
        year: readOptionalNumber(entry.year),
      };
    }).sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  }

  public async getGeneralNews(category: string): Promise<NewsArticle[]> {
    const payload = await this.request('/news', { category });

    return this.toNewsArticles(payload);
  }

  private async request(path: string, parameters: Record<string, string>): Promise<unknown> {
    return this.getJson(path, {
      ...parameters,
      token: this.apiKey,
    });
  }

  private toNewsArticles(payload: unknown): NewsArticle[] {
    if (!Array.isArray(payload)) {
      throw new ProviderError('unavailable', 'Finnhub returned an invalid news response.');
    }

    return payload.map((value) => {
      const article = readObject(value);
      const publishedAt = readNumber(article.datetime);

      return {
        headline: readString(article.headline),
        id: readNumber(article.id),
        imageUrl: readOptionalString(article.image),
        publishedAt: new Date(publishedAt * 1000).toISOString(),
        relatedSymbols: readRelatedSymbols(article.related),
        source: readString(article.source),
        summary: readOptionalString(article.summary),
        url: readString(article.url),
      };
    });
  }
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  throw new ProviderError('unavailable', 'Finnhub returned incomplete news data.');
}

function readOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ProviderError('unavailable', 'Finnhub returned an invalid news item.');
}

function readOptionalString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return null;
}

function readRelatedSymbols(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return value.split(',').map((symbol) => symbol.trim()).filter((symbol) => symbol.length > 0);
}

function readString(value: unknown): string {
  const string = readOptionalString(value);

  if (string === null) {
    throw new ProviderError('unavailable', 'Finnhub returned incomplete news data.');
  }

  return string;
}
