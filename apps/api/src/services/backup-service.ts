import type { BackupDocument } from '../domain/backup.js';
import type {
  DateFormat,
  EncryptedSecret,
  ThemePreference,
  WatchlistSortColumn,
  WatchlistSortDirection,
} from '../domain/user.js';
import type { InstrumentReference, MarketGroup, Watchlist, WatchlistEntry } from '../domain/watchlist.js';
import { HttpError } from '../errors/http-error.js';
import { MarketGroupRepository } from '../persistence/market-group-repository.js';
import { UserRepository } from '../persistence/user-repository.js';
import { WatchlistRepository } from '../persistence/watchlist-repository.js';
import { SecretCipher } from '../security/secret-cipher.js';

const PROVIDER_IDS: ReadonlySet<string> = new Set(['finnhub', 'logo-dev', 'massive', 'twelve-data']);
const IDENTIFIER_PATTERN = /^[a-z0-9-]{1,64}$/i;

export class BackupService {
  public constructor(
    private readonly users: UserRepository,
    private readonly watchlists: WatchlistRepository,
    private readonly marketGroups: MarketGroupRepository,
    private readonly cipher: SecretCipher,
  ) {}

  public async create(userId: string): Promise<BackupDocument> {
    const [settings, watchlists, marketGroups] = await Promise.all([
      this.users.getSettings(userId),
      this.watchlists.list(userId),
      this.marketGroups.get(userId),
    ]);
    const providerKeys = this.decryptProviderKeys(userId, settings.providerCredentials);

    return {
      exportedAt: new Date().toISOString(),
      format: 'open-finance-classic-backup',
      schemaVersion: 1,
      userData: {
        marketGroups,
        providerKeys,
        dateFormat: settings.dateFormat,
        selectedWatchlistId: settings.selectedWatchlistId,
        theme: settings.theme,
        watchlists,
        watchlistSortColumn: settings.watchlistSortColumn,
        watchlistSortDirection: settings.watchlistSortDirection,
      },
    };
  }

  public async restore(userId: string, value: unknown): Promise<void> {
    const backup = parseBackup(value);
    const providerCredentials = this.encryptProviderKeys(userId, backup.userData.providerKeys);
    const watchlists = backup.userData.watchlists.map((watchlist) => ({
      ...watchlist,
      userId,
    }));
    const selectedWatchlistId = resolveSelectedWatchlistId(
      backup.userData.selectedWatchlistId,
      watchlists,
    );

    await this.watchlists.replaceAll(userId, watchlists);
    await this.marketGroups.replace(userId, backup.userData.marketGroups);
    await this.users.replaceSettings(
      userId,
      backup.userData.theme,
      selectedWatchlistId,
      providerCredentials,
      120,
      backup.userData.dateFormat,
      backup.userData.watchlistSortColumn,
      backup.userData.watchlistSortDirection,
    );
  }

  private decryptProviderKeys(
    userId: string,
    credentials: Record<string, EncryptedSecret>,
  ): Record<string, string> {
    const providerKeys: Record<string, string> = {};

    for (const [providerId, credential] of Object.entries(credentials)) {
      if (!PROVIDER_IDS.has(providerId)) {
        continue;
      }

      try {
        providerKeys[providerId] = this.cipher.decrypt(userId, providerId, credential);
      } catch {
        throw new HttpError(409, `The stored ${providerId} API key cannot be exported.`);
      }
    }

    return providerKeys;
  }

  private encryptProviderKeys(userId: string, providerKeys: Record<string, string>): Record<string, EncryptedSecret> {
    const credentials: Record<string, EncryptedSecret> = {};

    for (const [providerId, apiKey] of Object.entries(providerKeys)) {
      credentials[providerId] = this.cipher.encrypt(userId, providerId, apiKey);
    }

    return credentials;
  }
}

function parseBackup(value: unknown): BackupDocument {
  const backup = readObject(value, 'Backup file');

  if (backup.format !== 'open-finance-classic-backup' || backup.schemaVersion !== 1) {
    throw new HttpError(400, 'This backup format or version is not supported.');
  }

  const userData = readObject(backup.userData, 'Backup user data');

  return {
    exportedAt: readString(backup.exportedAt, 'Backup export time'),
    format: 'open-finance-classic-backup',
    schemaVersion: 1,
    userData: {
      marketGroups: readMarketGroups(userData.marketGroups),
      providerKeys: readProviderKeys(userData.providerKeys),
      dateFormat: readDateFormat(userData.dateFormat),
      selectedWatchlistId: readNullableIdentifier(userData.selectedWatchlistId, 'Selected watchlist ID'),
      theme: readTheme(userData.theme),
      watchlists: readWatchlists(userData.watchlists),
      watchlistSortColumn: readWatchlistSortColumn(userData.watchlistSortColumn),
      watchlistSortDirection: readWatchlistSortDirection(userData.watchlistSortDirection),
    },
  };
}

function readInstrument(value: unknown): InstrumentReference {
  const instrument = readObject(value, 'Instrument');

  return {
    exchange: readNullableString(instrument.exchange, 'Instrument exchange'),
    name: readString(instrument.name, 'Instrument name'),
    symbol: readString(instrument.symbol, 'Instrument symbol').toUpperCase(),
    type: readNullableString(instrument.type, 'Instrument type'),
  };
}

function readMarketGroups(value: unknown): MarketGroup[] {
  const groups = readArray(value, 'Market groups');

  if (groups.length < 1 || groups.length > 6) {
    throw new HttpError(400, 'Backup market groups must contain 1-6 groups.');
  }

  const normalizedGroups = groups.map((value) => {
    const group = readObject(value, 'Market group');
    const instruments = readArray(group.instruments, 'Market group instruments');

    if (instruments.length < 1 || instruments.length > 12) {
      throw new HttpError(400, 'Each backup market group must contain 1-12 instruments.');
    }

    return {
      id: readIdentifier(group.id, 'Market group ID'),
      instruments: instruments.map((instrument) => readInstrument(instrument)),
      name: readString(group.name, 'Market group name'),
    } satisfies MarketGroup;
  });

  if (new Set(normalizedGroups.map((group) => group.id)).size !== normalizedGroups.length) {
    throw new HttpError(400, 'Backup market group IDs must be unique.');
  }

  return normalizedGroups;
}

function readProviderKeys(value: unknown): Record<string, string> {
  const providerKeys = readObject(value, 'Provider keys');
  const normalizedProviderKeys: Record<string, string> = {};

  for (const [providerId, apiKey] of Object.entries(providerKeys)) {
    if (!PROVIDER_IDS.has(providerId)) {
      throw new HttpError(400, `Unsupported provider in backup: ${providerId}.`);
    }

    normalizedProviderKeys[providerId] = readString(apiKey, `${providerId} API key`);
  }

  return normalizedProviderKeys;
}

function readTheme(value: unknown): ThemePreference {
  if (value === 'dark' || value === 'light' || value === 'system') {
    return value;
  }

  throw new HttpError(400, 'Backup theme is invalid.');
}

function readDateFormat(value: unknown): DateFormat {
  if (value === undefined) {
    return 'mm/dd/yyyy';
  }

  if (value === 'dd/mm/yyyy' || value === 'mm/dd/yyyy') {
    return value;
  }

  throw new HttpError(400, 'Backup date format is invalid.');
}

function readWatchlistSortColumn(value: unknown): WatchlistSortColumn | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (value === 'change' || value === 'name' || value === 'percentChange' || value === 'price') {
    return value;
  }

  throw new HttpError(400, 'Backup watchlist sort column is invalid.');
}

function readWatchlistSortDirection(value: unknown): WatchlistSortDirection {
  if (value === undefined) {
    return 'desc';
  }

  if (value === 'asc' || value === 'desc') {
    return value;
  }

  throw new HttpError(400, 'Backup watchlist sort direction is invalid.');
}

function readWatchlists(value: unknown): Watchlist[] {
  const watchlists = readArray(value, 'Watchlists');

  if (watchlists.length > 100) {
    throw new HttpError(400, 'Backup contains too many watchlists.');
  }

  const normalizedWatchlists = watchlists.map((value) => {
    const watchlist = readObject(value, 'Watchlist');
    const entries = readArray(watchlist.entries, 'Watchlist entries');

    if (entries.length > 500) {
      throw new HttpError(400, 'Backup watchlist contains too many entries.');
    }

    const normalizedEntries = entries.map((entry) => readWatchlistEntry(entry));

    if (new Set(normalizedEntries.map((entry) => entry.id)).size !== normalizedEntries.length) {
      throw new HttpError(400, 'Backup watchlist entry IDs must be unique.');
    }

    return {
      createdAt: readString(watchlist.createdAt, 'Watchlist creation time'),
      entries: normalizedEntries,
      id: readIdentifier(watchlist.id, 'Watchlist ID'),
      name: readString(watchlist.name, 'Watchlist name'),
      updatedAt: readString(watchlist.updatedAt, 'Watchlist update time'),
      userId: '',
    } satisfies Watchlist;
  });

  if (new Set(normalizedWatchlists.map((watchlist) => watchlist.id)).size !== normalizedWatchlists.length) {
    throw new HttpError(400, 'Backup watchlist IDs must be unique.');
  }

  return normalizedWatchlists;
}

function readWatchlistEntry(value: unknown): WatchlistEntry {
  const entry = readObject(value, 'Watchlist entry');

  return {
    addedAt: readString(entry.addedAt, 'Watchlist entry time'),
    id: readIdentifier(entry.id, 'Watchlist entry ID'),
    instrument: readInstrument(entry.instrument),
  };
}

function readArray(value: unknown, name: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  throw new HttpError(400, `${name} is invalid.`);
}

function readIdentifier(value: unknown, name: string): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new HttpError(400, `${name} is invalid.`);
  }

  return value;
}

function readNullableIdentifier(value: unknown, name: string): string | null {
  if (value === null) {
    return null;
  }

  return readIdentifier(value, name);
}

function readNullableString(value: unknown, name: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readString(value, name);
}

function readObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new HttpError(400, `${name} is invalid.`);
}

function readString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${name} is invalid.`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > 2048) {
    throw new HttpError(400, `${name} is invalid.`);
  }

  return normalizedValue;
}

function resolveSelectedWatchlistId(selectedWatchlistId: string | null, watchlists: Watchlist[]): string | null {
  if (selectedWatchlistId !== null && watchlists.some((watchlist) => watchlist.id === selectedWatchlistId)) {
    return selectedWatchlistId;
  }

  return watchlists[0]?.id ?? null;
}
