export interface InstrumentReference {
  exchange: string | null;
  name: string;
  symbol: string;
  type: string | null;
}

export interface MarketGroup {
  id: string;
  instruments: InstrumentReference[];
  name: string;
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
