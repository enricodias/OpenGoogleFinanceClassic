import type {
  ChartPoint,
  CompanyProfile,
  InstrumentSearchResult,
  MarketQuote,
} from '../domain/market.js';
import { ProviderError } from '../errors/provider-error.js';
import { ProviderClient } from './provider-client.js';

export class TwelveDataClient extends ProviderClient {
  public constructor(
    private readonly apiKey: string,
    baseUrl: string,
    requestTimeoutMs: number,
  ) {
    super(baseUrl, requestTimeoutMs);
  }

  public async getChart(symbol: string, interval: string, outputsize: number): Promise<ChartPoint[]> {
    const payload = this.readPayload(await this.request('/time_series', {
      interval,
      outputsize: String(outputsize),
      symbol,
    }));
    const values = readArray(payload.values);

    return values.map((value) => {
      const point = readObject(value);

      return {
        close: readRequiredNumber(point.close, 'chart close'),
        high: readRequiredNumber(point.high, 'chart high'),
        low: readRequiredNumber(point.low, 'chart low'),
        open: readRequiredNumber(point.open, 'chart open'),
        timestamp: readRequiredString(point.datetime, 'chart timestamp'),
        volume: readOptionalNumber(point.volume),
      };
    }).reverse();
  }

  public async getProfile(symbol: string): Promise<CompanyProfile> {
    const payload = this.readPayload(await this.request('/profile', { symbol }));

    return {
      currency: readOptionalString(payload.currency),
      description: readOptionalString(payload.description),
      exchange: readOptionalString(payload.exchange),
      industry: readOptionalString(payload.industry),
      marketCapitalization: readOptionalNumber(payload.market_capitalization),
      name: readRequiredString(payload.name, 'profile name'),
      sector: readOptionalString(payload.sector),
      symbol: readRequiredString(payload.symbol, 'profile symbol'),
      website: readOptionalString(payload.website),
    };
  }

  public async getQuote(symbol: string): Promise<MarketQuote> {
    const payload = this.readPayload(await this.request('/quote', { symbol }));
    const fiftyTwoWeek = readOptionalObject(payload.fifty_two_week);

    return {
      change: readOptionalNumber(payload.change),
      currency: readOptionalString(payload.currency),
      dayHigh: readOptionalNumber(payload.high),
      dayLow: readOptionalNumber(payload.low),
      exchange: readOptionalString(payload.exchange),
      isMarketOpen: typeof payload.is_market_open === 'boolean' ? payload.is_market_open : null,
      lastPrice: readRequiredNumber(payload.close, 'last price'),
      marketCapitalization: readOptionalNumber(payload.market_cap),
      name: readRequiredString(payload.name, 'quote name'),
      percentChange: readOptionalNumber(payload.percent_change),
      previousClose: readOptionalNumber(payload.previous_close),
      symbol: readRequiredString(payload.symbol, 'quote symbol'),
      timestamp: readOptionalString(payload.datetime),
      volume: readOptionalNumber(payload.volume),
      week52High: fiftyTwoWeek === null ? null : readOptionalNumber(fiftyTwoWeek.high),
      week52Low: fiftyTwoWeek === null ? null : readOptionalNumber(fiftyTwoWeek.low),
    };
  }

  public async search(query: string): Promise<InstrumentSearchResult[]> {
    const payload = this.readPayload(await this.request('/symbol_search', { symbol: query }));
    const results = readArray(payload.data);

    return results.map((value) => {
      const result = readObject(value);

      return {
        currency: readOptionalString(result.currency),
        exchange: readOptionalString(result.exchange),
        name: readRequiredString(result.instrument_name, 'instrument name'),
        symbol: readRequiredString(result.symbol, 'instrument symbol'),
        type: readOptionalString(result.instrument_type),
      };
    });
  }

  private async request(path: string, parameters: Record<string, string>): Promise<unknown> {
    return this.getJson(path, {
      ...parameters,
      apikey: this.apiKey,
    });
  }

  private readPayload(payload: unknown): Record<string, unknown> {
    const object = readObject(payload);

    if (object.status === 'error') {
      throw new ProviderError('unavailable', readOptionalString(object.message) ?? 'Twelve Data could not serve this request.');
    }

    return object;
  }
}

function readArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  throw new ProviderError('unavailable', 'Twelve Data returned an incomplete response.');
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ProviderError('unavailable', 'Twelve Data returned an invalid response.');
}

function readOptionalObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function readOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return null;
}

function readRequiredNumber(value: unknown, field: string): number {
  const number = readOptionalNumber(value);

  if (number === null) {
    throw new ProviderError('unavailable', `Twelve Data did not provide ${field}.`);
  }

  return number;
}

function readRequiredString(value: unknown, field: string): string {
  const string = readOptionalString(value);

  if (string === null) {
    throw new ProviderError('unavailable', `Twelve Data did not provide ${field}.`);
  }

  return string;
}
