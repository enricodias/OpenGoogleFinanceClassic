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

export interface RecommendationTrend {
  buy: number;
  hold: number;
  period: string;
  sell: number;
  strongBuy: number;
  strongSell: number;
}


export interface BrandColor {
  background: string;
  foreground: string;
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

export interface EarningsCalendarEntry {
  actualEarningsPerShare: number | null;
  currency: string | null;
  estimatedEarningsPerShare: number | null;
  exchange: string | null;
  name: string;
  releaseDate: string;
  releaseTime: string | null;
  symbol: string;
}

export interface FinnhubEarningsCalendarEntry {
  actualEarningsPerShare: number | null;
  actualRevenue: number | null;
  estimatedEarningsPerShare: number | null;
  estimatedRevenue: number | null;
  quarter: number | null;
  releaseDate: string;
  releaseTime: string | null;
  symbol: string;
  year: number | null;
}

export interface InstrumentSearchResult {
  currency: string | null;
  exchange: string | null;
  name: string;
  symbol: string;
  type: string | null;
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
