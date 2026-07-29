import { describe, expect, it, vi } from 'vitest';

import type { UserSettings } from '../src/domain/user.js';
import type { MarketGroup, Watchlist } from '../src/domain/watchlist.js';
import { HttpError } from '../src/errors/http-error.js';
import { MarketGroupRepository } from '../src/persistence/market-group-repository.js';
import { UserRepository } from '../src/persistence/user-repository.js';
import { WatchlistRepository } from '../src/persistence/watchlist-repository.js';
import { SecretCipher } from '../src/security/secret-cipher.js';
import { BackupService } from '../src/services/backup-service.js';

const userId = 'user-a';
const cipher = new SecretCipher(Buffer.alloc(32, 3));
const watchlist: Watchlist = {
  createdAt: '2026-07-27T12:00:00.000Z',
  entries: [{
    addedAt: '2026-07-27T12:00:00.000Z',
    id: 'entry-1',
    instrument: {
      exchange: 'NASDAQ',
      name: 'Apple Inc.',
      symbol: 'AAPL',
      type: 'Common Stock',
    },
  }],
  id: 'watchlist-1',
  name: 'Main list',
  updatedAt: '2026-07-27T12:00:00.000Z',
  userId,
};
const marketGroups: MarketGroup[] = [{
  id: 'us-markets',
  instruments: [{
    exchange: 'NYSE Arca',
    name: 'SPDR S&P 500 ETF Trust',
    symbol: 'SPY',
    type: 'ETF',
  }],
  name: 'US markets',
}];

describe('BackupService', () => {
  it('exports plain provider keys and encrypts them again when restoring', async () => {
    const settings: UserSettings = {
      providerCredentials: {
        finnhub: cipher.encrypt(userId, 'finnhub', 'finnhub-key'),
      },
      selectedWatchlistId: watchlist.id,
      theme: 'dark',
      userId,
    };
    const users = {
      getSettings: vi.fn(async () => settings),
      replaceSettings: vi.fn(async () => undefined),
    } as unknown as UserRepository;
    const watchlists = {
      list: vi.fn(async () => [watchlist]),
      replaceAll: vi.fn(async () => undefined),
    } as unknown as WatchlistRepository;
    const groups = {
      get: vi.fn(async () => marketGroups),
      replace: vi.fn(async () => undefined),
    } as unknown as MarketGroupRepository;
    const backups = new BackupService(users, watchlists, groups, cipher);

    const backup = await backups.create(userId);
    expect(backup.userData.providerKeys).toEqual({ finnhub: 'finnhub-key' });

    backup.userData.providerKeys = {
      'twelve-data': 'twelve-key',
    };
    await backups.restore(userId, backup);

    const replaceSettings = vi.mocked(users.replaceSettings);
    const encryptedCredentials = replaceSettings.mock.calls[0]?.[3] ?? {};
    const twelveDataCredential = encryptedCredentials['twelve-data'];
    expect(twelveDataCredential).toBeDefined();

    if (twelveDataCredential === undefined) {
      throw new Error('Twelve Data credential was not restored.');
    }

    expect(cipher.decrypt(userId, 'twelve-data', twelveDataCredential)).toBe('twelve-key');
    expect(vi.mocked(watchlists.replaceAll)).toHaveBeenCalledWith(userId, [watchlist]);
  });

  it('rejects an unsupported backup version before replacing data', async () => {
    const users = {} as UserRepository;
    const watchlists = {} as WatchlistRepository;
    const groups = {} as MarketGroupRepository;
    const backups = new BackupService(users, watchlists, groups, cipher);

    await expect(backups.restore(userId, {
      format: 'open-finance-classic-backup',
      schemaVersion: 2,
    })).rejects.toBeInstanceOf(HttpError);
  });
});
