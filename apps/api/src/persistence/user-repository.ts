import { randomUUID } from 'node:crypto';

import type {
  EncryptedSecret,
  DateFormat,
  Session,
  ThemePreference,
  User,
  UserSettings,
  WatchlistSortColumn,
  WatchlistSortDirection,
} from '../domain/user.js';
import { getJson, type RedisClient, setJson } from './redis-client.js';

const LOCAL_USER_ID = 'local';

export class UserRepository {
  public constructor(private readonly client: RedisClient) {}

  public async createUser(username: string, passwordHash: string): Promise<User | null> {
    const id = randomUUID();
    const usernameKey = this.usernameKey(username);
    const usernameWasReserved = await this.client.set(usernameKey, id, {
      NX: true,
    });

    if (usernameWasReserved === null) {
      return null;
    }

    const now = new Date().toISOString();
    const user: User = {
      createdAt: now,
      id,
      passwordHash,
      updatedAt: now,
      username,
    };

    try {
      await setJson(this.client, this.userKey(id), '$', user);
      await setJson(this.client, this.settingsKey(id), '$', this.defaultSettings(id));
    } catch (error) {
      await this.client.del(usernameKey);
      throw error;
    }

    return user;
  }

  public async ensureLocalUser(): Promise<User> {
    const existingUser = await this.findUserById(LOCAL_USER_ID);

    if (existingUser !== null) {
      return existingUser;
    }

    const now = new Date().toISOString();
    const user: User = {
      createdAt: now,
      id: LOCAL_USER_ID,
      passwordHash: null,
      updatedAt: now,
      username: 'local',
    };

    await setJson(this.client, this.userKey(user.id), '$', user);
    await setJson(this.client, this.settingsKey(user.id), '$', this.defaultSettings(user.id));

    return user;
  }

  public async findUserById(id: string): Promise<User | null> {
    return getJson<User>(this.client, this.userKey(id));
  }

  public async findUserByUsername(username: string): Promise<User | null> {
    const id = await this.client.get(this.usernameKey(username));

    if (id === null) {
      return null;
    }

    return this.findUserById(id);
  }

  public async getSettings(userId: string): Promise<UserSettings> {
    const settings = await getJson<UserSettings>(this.client, this.settingsKey(userId));

    if (settings !== null) {
      return {
        ...settings,
        dateFormat: settings.dateFormat ?? 'dd/mm/yyyy',
        quoteRefreshIntervalSeconds: settings.quoteRefreshIntervalSeconds ?? 120,
        watchlistSortColumn: settings.watchlistSortColumn ?? null,
        watchlistSortDirection: settings.watchlistSortDirection ?? 'desc',
      };
    }

    const defaultSettings = this.defaultSettings(userId);
    await setJson(this.client, this.settingsKey(userId), '$', defaultSettings);

    return defaultSettings;
  }

  public async setProviderCredential(
    userId: string,
    providerId: string,
    credential: EncryptedSecret,
  ): Promise<void> {
    const settings = await this.getSettings(userId);
    const providerCredentials = {
      ...settings.providerCredentials,
      [providerId]: credential,
    };

    await setJson(this.client, this.settingsKey(userId), '$.providerCredentials', providerCredentials);
  }

  public async removeProviderCredential(userId: string, providerId: string): Promise<void> {
    const settings = await this.getSettings(userId);

    if (settings.providerCredentials[providerId] === undefined) {
      return;
    }

    delete settings.providerCredentials[providerId];
    await setJson(this.client, this.settingsKey(userId), '$.providerCredentials', settings.providerCredentials);
  }

  public async setSelectedWatchlistId(userId: string, watchlistId: string | null): Promise<void> {
    await this.getSettings(userId);
    await setJson(this.client, this.settingsKey(userId), '$.selectedWatchlistId', watchlistId);
  }

  public async setQuoteRefreshIntervalSeconds(userId: string, seconds: number): Promise<void> {
    await this.getSettings(userId);
    await setJson(this.client, this.settingsKey(userId), '$.quoteRefreshIntervalSeconds', seconds);
  }

  public async setTheme(userId: string, theme: ThemePreference): Promise<void> {
    await this.getSettings(userId);
    await setJson(this.client, this.settingsKey(userId), '$.theme', theme);
  }

  public async setDateFormat(userId: string, dateFormat: DateFormat): Promise<void> {
    await this.getSettings(userId);
    await setJson(this.client, this.settingsKey(userId), '$.dateFormat', dateFormat);
  }

  public async setWatchlistSort(
    userId: string,
    watchlistSortColumn: WatchlistSortColumn | null,
    watchlistSortDirection: WatchlistSortDirection,
  ): Promise<void> {
    await this.getSettings(userId);
    await setJson(this.client, this.settingsKey(userId), '$.watchlistSortColumn', watchlistSortColumn);
    await setJson(this.client, this.settingsKey(userId), '$.watchlistSortDirection', watchlistSortDirection);
  }

  public async replaceSettings(
    userId: string,
    theme: ThemePreference,
    selectedWatchlistId: string | null,
    providerCredentials: Record<string, EncryptedSecret>,
    quoteRefreshIntervalSeconds = 120,
    dateFormat: DateFormat = 'dd/mm/yyyy',
    watchlistSortColumn: WatchlistSortColumn | null = null,
    watchlistSortDirection: WatchlistSortDirection = 'desc',
  ): Promise<void> {
    await setJson(this.client, this.settingsKey(userId), '$', {
      dateFormat,
      providerCredentials,
      quoteRefreshIntervalSeconds,
      selectedWatchlistId,
      theme,
      userId,
      watchlistSortColumn,
      watchlistSortDirection,
    } satisfies UserSettings);
  }

  public async createSession(userId: string, ttlSeconds: number): Promise<Session> {
    const session: Session = {
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      userId,
    };

    await setJson(this.client, this.sessionKey(session.id), '$', session);
    await this.client.expire(this.sessionKey(session.id), ttlSeconds);

    return session;
  }

  public async findSession(id: string): Promise<Session | null> {
    return getJson<Session>(this.client, this.sessionKey(id));
  }

  public async deleteSession(id: string): Promise<void> {
    await this.client.del(this.sessionKey(id));
  }

  private defaultSettings(userId: string): UserSettings {
    return {
      dateFormat: 'dd/mm/yyyy',
      providerCredentials: {},
      quoteRefreshIntervalSeconds: 120,
      selectedWatchlistId: null,
      theme: 'system',
      userId,
      watchlistSortColumn: null,
      watchlistSortDirection: 'desc',
    };
  }

  private sessionKey(id: string): string {
    return `session:${id}`;
  }

  private settingsKey(userId: string): string {
    return `user-settings:${userId}`;
  }

  private userKey(id: string): string {
    return `user:${id}`;
  }

  private usernameKey(username: string): string {
    return `username:${username}`;
  }
}
