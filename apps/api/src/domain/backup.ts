import type { ThemePreference } from './user.js';
import type { MarketGroup, Watchlist } from './watchlist.js';

export interface BackupDocument {
  exportedAt: string;
  format: 'open-finance-classic-backup';
  schemaVersion: 1;
  userData: {
    marketGroups: MarketGroup[];
    providerKeys: Record<string, string>;
    selectedWatchlistId: string | null;
    theme: ThemePreference;
    watchlists: Watchlist[];
  };
}
