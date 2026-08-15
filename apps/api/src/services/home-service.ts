import type { CachedResult } from '../persistence/shared-cache.js';
import { MarketGroupRepository } from '../persistence/market-group-repository.js';
import { UserRepository } from '../persistence/user-repository.js';
import { WatchlistRepository } from '../persistence/watchlist-repository.js';
import type { EarningsCalendarEntry, MarketQuote, NewsArticle } from '../domain/market.js';
import type { InstrumentReference, MarketGroup, Watchlist } from '../domain/watchlist.js';
import { HttpError } from '../errors/http-error.js';
import { ProviderError } from '../errors/provider-error.js';
import { MarketDataService } from './market-data-service.js';

interface QuoteTile {
  error: string | null;
  instrument: InstrumentReference;
  quote: CachedResult<MarketQuote> | null;
}

interface HomeMarketGroup {
  id: string;
  name: string;
  quotes: QuoteTile[];
}

export interface HomeData {
  earningsCalendar: CachedResult<EarningsCalendarEntry[]> | null;
  marketGroups: HomeMarketGroup[];
  news: CachedResult<NewsArticle[]> | null;
  selectedWatchlist: {
    quotes: QuoteTile[];
    watchlist: Watchlist | null;
  };
}

export class HomeService {
  public constructor(
    private readonly users: UserRepository,
    private readonly watchlists: WatchlistRepository,
    private readonly marketGroups: MarketGroupRepository,
    private readonly marketData: MarketDataService,
  ) {}

  public async getHome(userId: string): Promise<HomeData> {
    const [watchlists, groups, settings] = await Promise.all([
      this.watchlists.list(userId),
      this.marketGroups.get(userId),
      this.users.getSettings(userId),
    ]);
    const selectedWatchlist = this.resolveSelectedWatchlist(watchlists, settings.selectedWatchlistId);

    if (selectedWatchlist !== null && selectedWatchlist.id !== settings.selectedWatchlistId) {
      await this.users.setSelectedWatchlistId(userId, selectedWatchlist.id);
    }

    const [marketGroupData, watchlistQuotes, earningsCalendar, news] = await Promise.all([
      this.getMarketGroups(userId, groups),
      this.getWatchlistQuotes(userId, selectedWatchlist),
      this.optionalEarningsCalendar(userId, selectedWatchlist),
      this.optionalNews(userId),
    ]);

    return {
      earningsCalendar,
      marketGroups: marketGroupData,
      news,
      selectedWatchlist: {
        quotes: watchlistQuotes,
        watchlist: selectedWatchlist,
      },
    };
  }

  private async getMarketGroups(userId: string, groups: MarketGroup[]): Promise<HomeMarketGroup[]> {
    return Promise.all(groups.map(async (group) => ({
      id: group.id,
      name: group.name,
      quotes: await Promise.all(group.instruments.map((instrument) => this.getQuoteTile(userId, instrument))),
    })));
  }

  private async getQuoteTile(userId: string, instrument: InstrumentReference): Promise<QuoteTile> {
    try {
      const quote = await this.marketData.getQuote(userId, instrument.symbol);

      return {
        error: null,
        instrument,
        quote,
      };
    } catch (error) {
      return {
        error: errorMessage(error),
        instrument,
        quote: null,
      };
    }
  }

  private async getWatchlistQuotes(userId: string, watchlist: Watchlist | null): Promise<QuoteTile[]> {
    if (watchlist === null) {
      return [];
    }

    return Promise.all(watchlist.entries.map((entry) => this.getQuoteTile(userId, entry.instrument)));
  }

  private async optionalEarningsCalendar(
    userId: string,
    watchlist: Watchlist | null,
  ): Promise<CachedResult<EarningsCalendarEntry[]> | null> {
    if (watchlist === null || watchlist.entries.length === 0) {
      return null;
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const horizon = new Date();
      horizon.setUTCDate(horizon.getUTCDate() + 180);
      const earningsCalendar = await this.marketData.getEarningsCalendar(
        userId,
        today,
        horizon.toISOString().slice(0, 10),
      );
      const instruments = instrumentsBySymbol(watchlist);
      const entries = earningsCalendar.data.flatMap((entry) => {
        const instrument = instruments.get(entry.symbol.toUpperCase());

        if (instrument === undefined) {
          return [];
        }

        return [{
          actualEarningsPerShare: entry.actualEarningsPerShare,
          currency: null,
          estimatedEarningsPerShare: entry.estimatedEarningsPerShare,
          exchange: instrument.exchange,
          name: instrument.name,
          releaseDate: entry.releaseDate,
          releaseTime: entry.releaseTime,
          symbol: entry.symbol,
        }];
      }).sort((left, right) => left.releaseDate.localeCompare(right.releaseDate));

      return {
        data: entries.slice(0, 5),
        fetchedAt: earningsCalendar.fetchedAt,
        isStale: earningsCalendar.isStale,
      };
    } catch (error) {
      if (isProviderConfigurationError(error)) {
        return null;
      }

      throw error;
    }
  }

  private async optionalNews(userId: string): Promise<CachedResult<NewsArticle[]> | null> {
    try {
      const news = await this.marketData.getGeneralNews(userId, 'general');

      return {
        ...news,
        data: news.data.slice(0, 6),
      };
    } catch (error) {
      if (isProviderConfigurationError(error)) {
        return null;
      }

      throw error;
    }
  }

  private resolveSelectedWatchlist(
    watchlists: Watchlist[],
    selectedWatchlistId: string | null,
  ): Watchlist | null {
    const selectedWatchlist = watchlists.find((watchlist) => watchlist.id === selectedWatchlistId);

    if (selectedWatchlist !== undefined) {
      return selectedWatchlist;
    }

    return watchlists[0] ?? null;
  }
}

function instrumentsBySymbol(watchlist: Watchlist): Map<string, InstrumentReference> {
  const instruments = new Map<string, InstrumentReference>();

  for (const entry of watchlist.entries) {
    instruments.set(entry.instrument.symbol.toUpperCase(), entry.instrument);
  }

  return instruments;
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpError || error instanceof ProviderError) {
    return error.message;
  }

  return 'The quote is currently unavailable.';
}

function isProviderConfigurationError(error: unknown): boolean {
  if (error instanceof HttpError && error.statusCode === 409) {
    return true;
  }

  if (error instanceof ProviderError) {
    return true;
  }

  return false;
}
