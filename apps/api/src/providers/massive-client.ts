import type { ChartPoint, DividendRecord } from '../domain/market.js';
import { ProviderError } from '../errors/provider-error.js';
import { ProviderClient } from './provider-client.js';

const MAX_HISTORY_DAYS = 730;

const INTERVAL_STEPS: Record<string, { multiplier: number; timespan: string }> = {
  '1min': { multiplier: 1, timespan: 'minute' },
  '5min': { multiplier: 5, timespan: 'minute' },
  '15min': { multiplier: 15, timespan: 'minute' },
  '30min': { multiplier: 30, timespan: 'minute' },
  '1h': { multiplier: 1, timespan: 'hour' },
  '4h': { multiplier: 4, timespan: 'hour' },
  '1day': { multiplier: 1, timespan: 'day' },
  '1week': { multiplier: 1, timespan: 'week' },
  '1month': { multiplier: 1, timespan: 'month' },
};

const INTERVAL_MS: Record<string, number> = {
  '1min': 60_000,
  '5min': 5 * 60_000,
  '15min': 15 * 60_000,
  '30min': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1day': 24 * 60 * 60_000,
  '1week': 7 * 24 * 60 * 60_000,
  '1month': 30 * 24 * 60 * 60_000,
};

const INTRADAY_LOOKBACK_MULTIPLIER = 5;
const DAILY_LOOKBACK_MULTIPLIER = 1.6;
const LONG_INTERVAL_LOOKBACK_MULTIPLIER = 1.2;

export class MassiveClient extends ProviderClient {
  public constructor(
    private readonly apiKey: string,
    baseUrl: string,
    requestTimeoutMs: number,
  ) {
    super('Massive', baseUrl, requestTimeoutMs);
  }

  public async getChart(symbol: string, interval: string, outputsize: number): Promise<ChartPoint[]> {
    const step = INTERVAL_STEPS[interval];

    if (step === undefined) {
      throw new ProviderError('unavailable', `Massive does not support the ${interval} chart interval.`);
    }

    const { from, to } = this.dateRange(interval, outputsize);
    const path = `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${step.multiplier}/${step.timespan}/${from}/${to}`;
    const payload = this.readPayload(await this.request(path, {
      limit: String(outputsize),
      sort: 'desc',
    }));
    const results = readArray(payload.results ?? []);

    return results.map((value) => {
      const bar = readObject(value);

      return {
        close: readRequiredNumber(bar.c, 'chart close'),
        high: readRequiredNumber(bar.h, 'chart high'),
        low: readRequiredNumber(bar.l, 'chart low'),
        open: readRequiredNumber(bar.o, 'chart open'),
        timestamp: new Date(readRequiredNumber(bar.t, 'chart timestamp')).toISOString(),
        volume: readOptionalNumber(bar.v),
      };
    }).reverse();
  }

  public async getDividends(symbol: string): Promise<DividendRecord[]> {
    const payload = this.readPayload(await this.request('/stocks/v1/dividends', {
      limit: '100',
      ticker: symbol,
    }));
    const results = readArray(payload.results ?? []);

    return results.map((value) => {
      const entry = readObject(value);

      return {
        cashAmount: readRequiredNumber(entry.cash_amount, 'dividend cash amount'),
        currency: readOptionalString(entry.currency),
        declarationDate: readOptionalString(entry.declaration_date),
        distributionType: readOptionalString(entry.distribution_type),
        exDividendDate: readRequiredString(entry.ex_dividend_date, 'dividend ex-dividend date'),
        frequency: readOptionalNumber(entry.frequency),
        historicalAdjustmentFactor: readOptionalNumber(entry.historical_adjustment_factor),
        payDate: readOptionalString(entry.pay_date),
        recordDate: readOptionalString(entry.record_date),
        splitAdjustedCashAmount: readOptionalNumber(entry.split_adjusted_cash_amount),
        symbol: readRequiredString(entry.ticker, 'dividend ticker'),
      };
    }).sort((left, right) => right.exDividendDate.localeCompare(left.exDividendDate));
  }

  private dateRange(interval: string, outputsize: number): { from: string; to: string } {
    const intervalMs = INTERVAL_MS[interval];

    if (intervalMs === undefined) {
      throw new ProviderError('unavailable', `Massive does not support the ${interval} chart interval.`);
    }

    const lookbackMs = intervalMs * outputsize * this.lookbackMultiplier(interval);
    const cappedLookbackMs = Math.min(lookbackMs, MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const to = new Date();
    const from = new Date(to.getTime() - cappedLookbackMs);

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }

  private lookbackMultiplier(interval: string): number {
    if (interval === '1day') {
      return DAILY_LOOKBACK_MULTIPLIER;
    }

    if (interval === '1week' || interval === '1month') {
      return LONG_INTERVAL_LOOKBACK_MULTIPLIER;
    }

    return INTRADAY_LOOKBACK_MULTIPLIER;
  }

  private async request(path: string, parameters: Record<string, string>): Promise<unknown> {
    return this.getJson(path, {
      ...parameters,
      apiKey: this.apiKey,
    });
  }

  private readPayload(payload: unknown): Record<string, unknown> {
    const object = readObject(payload);

    if (typeof object.status === 'string' && object.status !== 'OK') {
      throw new ProviderError('unavailable', readOptionalString(object.message) ?? 'Massive could not serve this request.');
    }

    return object;
  }
}

function readArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  throw new ProviderError('unavailable', 'Massive returned an incomplete response.');
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ProviderError('unavailable', 'Massive returned an invalid response.');
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
    throw new ProviderError('unavailable', `Massive did not provide ${field}.`);
  }

  return number;
}

function readRequiredString(value: unknown, field: string): string {
  const string = readOptionalString(value);

  if (string === null) {
    throw new ProviderError('unavailable', `Massive did not provide ${field}.`);
  }

  return string;
}
