export interface ApiErrorShape {
  error: string;
}

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface AuthSession {
  authenticated: boolean;
  authenticationMode: 'disabled' | 'required';
  user: {
    id: string;
    username: string;
  } | null;
}

export interface BackupDocument {
  exportedAt: string;
  format: 'open-finance-classic-backup';
  schemaVersion: 1;
  userData: {
    marketGroups: MarketGroup[];
    providerKeys: Record<string, string>;
    selectedWatchlistId: string | null;
    theme: 'dark' | 'light' | 'system';
    watchlists: Watchlist[];
  };
}

export interface CachedResult<T> {
  data: T;
  fetchedAt: string;
  isStale: boolean;
}

export interface ChartPoint {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  volume: number | null;
}

export interface CompanySnapshot {
  marketCapitalization: number | null;
  website: string | null;
}

export interface EarningsCalendarEntry {
  actualEarningsPerShare: number | null;
  actualRevenue?: number | null;
  currency: string | null;
  estimatedEarningsPerShare: number | null;
  estimatedRevenue?: number | null;
  exchange: string | null;
  name: string;
  quarter?: number | null;
  releaseDate: string;
  releaseTime: string | null;
  symbol: string;
  year?: number | null;
}

export interface EarningsRecord {
  actualEarningsPerShare: number | null;
  actualRevenue: number | null;
  estimatedEarningsPerShare: number | null;
  estimatedRevenue: number | null;
  quarter: number | null;
  releaseDate: string;
  releaseTime: string | null;
  surprisePercent: number | null;
  year: number | null;
}

export interface InstrumentReference {
  exchange: string | null;
  name: string;
  symbol: string;
  type: string | null;
}

export interface InstrumentSearchResult extends InstrumentReference {
  currency: string | null;
}

export interface MarketGroup {
  id: string;
  instruments: InstrumentReference[];
  name: string;
}

export interface MarketQuote {
  change: number | null;
  currency: string | null;
  dayHigh: number | null;
  dayLow: number | null;
  exchange: string | null;
  isMarketOpen: boolean | null;
  lastPrice: number;
  marketCapitalization: number | null;
  name: string;
  percentChange: number | null;
  previousClose: number | null;
  symbol: string;
  timestamp: string | null;
  volume: number | null;
  week52High: number | null;
  week52Low: number | null;
}

export interface NewsArticle {
  headline: string;
  id: number;
  imageUrl: string | null;
  publishedAt: string;
  relatedSymbols: string[];
  source: string;
  summary: string | null;
  url: string;
}

export interface QuoteTile {
  error: string | null;
  instrument: InstrumentReference;
  quote: CachedResult<MarketQuote> | null;
}

export interface Settings {
  configuredProviders: string[];
  dateFormat: 'dd/mm/yyyy' | 'mm/dd/yyyy';
  quoteRefreshIntervalSeconds: number;
  selectedWatchlistId: string | null;
  theme: 'dark' | 'light' | 'system';
}

export interface Watchlist {
  createdAt: string;
  entries: WatchlistEntry[];
  id: string;
  name: string;
  updatedAt: string;
  userId: string;
}

export interface WatchlistEntry {
  addedAt: string;
  id: string;
  instrument: InstrumentReference;
}

export interface HomeData {
  earningsCalendar: CachedResult<EarningsCalendarEntry[]> | null;
  marketGroups: {
    id: string;
    name: string;
    quotes: QuoteTile[];
  }[];
  news: CachedResult<NewsArticle[]> | null;
  selectedWatchlist: {
    quotes: QuoteTile[];
    watchlist: Watchlist | null;
  };
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json() as unknown;

  if (!response.ok) {
    const message = isApiErrorShape(body) ? body.error : 'The request failed.';
    throw new ApiError(response.status, message);
  }

  return body as T;
}

function isApiErrorShape(value: unknown): value is ApiErrorShape {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return typeof (value as ApiErrorShape).error === 'string';
}
