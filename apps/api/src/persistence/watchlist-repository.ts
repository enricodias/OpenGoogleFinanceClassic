import { randomUUID } from 'node:crypto';

import type { InstrumentReference, Watchlist, WatchlistEntry } from '../domain/watchlist.js';
import { getJson, type RedisClient, setJson } from './redis-client.js';

interface WatchlistIndex {
  ids: string[];
  userId: string;
}

export class WatchlistRepository {
  public constructor(private readonly client: RedisClient) {}

  public async addEntry(
    userId: string,
    watchlistId: string,
    instrument: InstrumentReference,
  ): Promise<WatchlistEntry | null> {
    const watchlist = await this.findById(userId, watchlistId);

    if (watchlist === null) {
      return null;
    }

    const duplicate = watchlist.entries.some((entry) => (
      entry.instrument.symbol === instrument.symbol
      && entry.instrument.exchange === instrument.exchange
    ));

    if (duplicate) {
      return null;
    }

    const entry: WatchlistEntry = {
      addedAt: new Date().toISOString(),
      id: randomUUID(),
      instrument,
    };
    watchlist.entries.push(entry);
    watchlist.updatedAt = new Date().toISOString();

    await this.save(watchlist);

    return entry;
  }

  public async create(userId: string, name: string): Promise<Watchlist> {
    const now = new Date().toISOString();
    const watchlist: Watchlist = {
      createdAt: now,
      entries: [],
      id: randomUUID(),
      name,
      updatedAt: now,
      userId,
    };
    const index = await this.getIndex(userId);
    index.ids.push(watchlist.id);

    await this.save(watchlist);
    await setJson(this.client, this.indexKey(userId), '$', index);

    return watchlist;
  }

  public async delete(userId: string, watchlistId: string): Promise<boolean> {
    const watchlist = await this.findById(userId, watchlistId);

    if (watchlist === null) {
      return false;
    }

    const index = await this.getIndex(userId);
    index.ids = index.ids.filter((id) => id !== watchlistId);

    await this.client.del(this.watchlistKey(watchlistId));
    await setJson(this.client, this.indexKey(userId), '$', index);

    return true;
  }

  public async findById(userId: string, watchlistId: string): Promise<Watchlist | null> {
    const watchlist = await getJson<Watchlist>(this.client, this.watchlistKey(watchlistId));

    if (watchlist === null) {
      return null;
    }

    if (watchlist.userId !== userId) {
      return null;
    }

    return watchlist;
  }

  public async list(userId: string): Promise<Watchlist[]> {
    const index = await this.getIndex(userId);
    const watchlists = await Promise.all(index.ids.map((id) => this.findById(userId, id)));

    return watchlists.filter((watchlist): watchlist is Watchlist => watchlist !== null);
  }

  public async removeEntry(userId: string, watchlistId: string, entryId: string): Promise<boolean> {
    const watchlist = await this.findById(userId, watchlistId);

    if (watchlist === null) {
      return false;
    }

    const entries = watchlist.entries.filter((entry) => entry.id !== entryId);

    if (entries.length === watchlist.entries.length) {
      return false;
    }

    watchlist.entries = entries;
    watchlist.updatedAt = new Date().toISOString();
    await this.save(watchlist);

    return true;
  }

  public async reorderEntries(
    userId: string,
    watchlistId: string,
    entryIds: string[],
  ): Promise<Watchlist | null> {
    const watchlist = await this.findById(userId, watchlistId);

    if (watchlist === null) {
      return null;
    }

    if (entryIds.length !== watchlist.entries.length) {
      return null;
    }

    const entriesById = new Map(watchlist.entries.map((entry) => [entry.id, entry]));
    const reorderedEntries = entryIds.map((id) => entriesById.get(id));

    if (reorderedEntries.some((entry) => entry === undefined)) {
      return null;
    }

    if (new Set(entryIds).size !== entryIds.length) {
      return null;
    }

    watchlist.entries = reorderedEntries as WatchlistEntry[];
    watchlist.updatedAt = new Date().toISOString();
    await this.save(watchlist);

    return watchlist;
  }

  public async replaceAll(userId: string, watchlists: Watchlist[]): Promise<void> {
    const currentIndex = await this.getIndex(userId);
    const importedIds = new Set(watchlists.map((watchlist) => watchlist.id));

    for (const watchlist of watchlists) {
      await this.save({
        ...watchlist,
        userId,
      });
    }

    await setJson(this.client, this.indexKey(userId), '$', {
      ids: watchlists.map((watchlist) => watchlist.id),
      userId,
    } satisfies WatchlistIndex);

    const removedIds = currentIndex.ids.filter((id) => !importedIds.has(id));

    if (removedIds.length > 0) {
      await this.client.del(removedIds.map((id) => this.watchlistKey(id)));
    }
  }

  public async rename(userId: string, watchlistId: string, name: string): Promise<Watchlist | null> {
    const watchlist = await this.findById(userId, watchlistId);

    if (watchlist === null) {
      return null;
    }

    watchlist.name = name;
    watchlist.updatedAt = new Date().toISOString();
    await this.save(watchlist);

    return watchlist;
  }

  private async getIndex(userId: string): Promise<WatchlistIndex> {
    const index = await getJson<WatchlistIndex>(this.client, this.indexKey(userId));

    if (index !== null) {
      return index;
    }

    const defaultIndex: WatchlistIndex = {
      ids: [],
      userId,
    };
    await setJson(this.client, this.indexKey(userId), '$', defaultIndex);

    return defaultIndex;
  }

  private indexKey(userId: string): string {
    return `watchlist-index:${userId}`;
  }

  private async save(watchlist: Watchlist): Promise<void> {
    await setJson(this.client, this.watchlistKey(watchlist.id), '$', watchlist);
  }

  private watchlistKey(watchlistId: string): string {
    return `watchlist:${watchlistId}`;
  }
}
