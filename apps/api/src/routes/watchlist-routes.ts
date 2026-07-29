import type { FastifyInstance } from 'fastify';

import type { InstrumentReference } from '../domain/watchlist.js';
import { HttpError } from '../errors/http-error.js';
import { UserRepository } from '../persistence/user-repository.js';
import { WatchlistRepository } from '../persistence/watchlist-repository.js';
import { AuthService } from '../services/auth-service.js';

interface NameBody {
  name?: unknown;
}

interface InstrumentBody {
  exchange?: unknown;
  name?: unknown;
  symbol?: unknown;
  type?: unknown;
}

interface ReorderBody {
  entryIds?: unknown;
}

interface SelectedWatchlistBody {
  watchlistId?: unknown;
}

export function registerWatchlistRoutes(
  server: FastifyInstance,
  auth: AuthService,
  users: UserRepository,
  watchlists: WatchlistRepository,
): void {
  server.get('/api/watchlists', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const [userWatchlists, settings] = await Promise.all([
      watchlists.list(user.id),
      users.getSettings(user.id),
    ]);

    return {
      selectedWatchlistId: settings.selectedWatchlistId,
      watchlists: userWatchlists,
    };
  });

  server.post('/api/watchlists', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const watchlist = await watchlists.create(user.id, readName(request.body));
    const settings = await users.getSettings(user.id);

    if (settings.selectedWatchlistId === null) {
      await users.setSelectedWatchlistId(user.id, watchlist.id);
    }

    return reply.code(201).send(watchlist);
  });

  server.put('/api/watchlists/selected', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const watchlistId = readSelectedWatchlistId(request.body);

    if (watchlistId !== null) {
      const watchlist = await watchlists.findById(user.id, watchlistId);

      if (watchlist === null) {
        throw new HttpError(404, 'Watchlist not found.');
      }
    }

    await users.setSelectedWatchlistId(user.id, watchlistId);

    return reply.code(204).send();
  });

  server.put('/api/watchlists/:watchlistId', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const watchlist = await watchlists.rename(
      user.id,
      readWatchlistId(request.params),
      readName(request.body),
    );

    if (watchlist === null) {
      throw new HttpError(404, 'Watchlist not found.');
    }

    return watchlist;
  });

  server.delete('/api/watchlists/:watchlistId', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const watchlistId = readWatchlistId(request.params);
    const deleted = await watchlists.delete(user.id, watchlistId);

    if (!deleted) {
      throw new HttpError(404, 'Watchlist not found.');
    }

    const settings = await users.getSettings(user.id);

    if (settings.selectedWatchlistId === watchlistId) {
      const remainingWatchlists = await watchlists.list(user.id);
      await users.setSelectedWatchlistId(user.id, remainingWatchlists[0]?.id ?? null);
    }

    return reply.code(204).send();
  });

  server.post('/api/watchlists/:watchlistId/entries', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const entry = await watchlists.addEntry(
      user.id,
      readWatchlistId(request.params),
      readInstrument(request.body),
    );

    if (entry === null) {
      throw new HttpError(409, 'The watchlist does not exist or already contains this instrument.');
    }

    return reply.code(201).send(entry);
  });

  server.put('/api/watchlists/:watchlistId/entries/order', async (request) => {
    const user = await auth.requireCurrentUser(request);
    const watchlist = await watchlists.reorderEntries(
      user.id,
      readWatchlistId(request.params),
      readEntryIds(request.body),
    );

    if (watchlist === null) {
      throw new HttpError(400, 'The requested entry order is invalid.');
    }

    return watchlist;
  });

  server.delete('/api/watchlists/:watchlistId/entries/:entryId', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const params = request.params as { entryId?: unknown; watchlistId?: unknown };
    const entryId = readIdentifier(params.entryId, 'entryId');
    const removed = await watchlists.removeEntry(user.id, readWatchlistId(params), entryId);

    if (!removed) {
      throw new HttpError(404, 'Watchlist entry not found.');
    }

    return reply.code(204).send();
  });
}

function readEntryIds(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'entryIds is required.');
  }

  const entryIds = (body as ReorderBody).entryIds;

  if (!Array.isArray(entryIds)) {
    throw new HttpError(400, 'entryIds is required.');
  }

  return entryIds.map((entryId) => readIdentifier(entryId, 'entryId'));
}

function readInstrument(body: unknown): InstrumentReference {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Instrument details are required.');
  }

  const input = body as InstrumentBody;
  const symbol = readRequiredString(input.symbol, 'symbol').toUpperCase();

  return {
    exchange: readNullableString(input.exchange, 'exchange'),
    name: readRequiredString(input.name, 'name'),
    symbol,
    type: readNullableString(input.type, 'type'),
  };
}

function readName(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'name is required.');
  }

  return readRequiredString((body as NameBody).name, 'name');
}

function readNullableString(value: unknown, name: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readRequiredString(value, name);
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${name} is required.`);
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0 || trimmedValue.length > 128) {
    throw new HttpError(400, `${name} must contain 1-128 characters.`);
  }

  return trimmedValue;
}

function readSelectedWatchlistId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'watchlistId is required.');
  }

  const watchlistId = (body as SelectedWatchlistBody).watchlistId;

  if (watchlistId === null) {
    return null;
  }

  return readIdentifier(watchlistId, 'watchlistId');
}

function readWatchlistId(params: unknown): string {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new HttpError(400, 'watchlistId is required.');
  }

  return readIdentifier((params as { watchlistId?: unknown }).watchlistId, 'watchlistId');
}

function readIdentifier(value: unknown, name: string): string {
  const identifier = readRequiredString(value, name);

  if (identifier.length > 64) {
    throw new HttpError(400, `${name} is invalid.`);
  }

  return identifier;
}
