import type { FastifyInstance } from 'fastify';

import type { InstrumentReference, MarketGroup } from '../domain/watchlist.js';
import { HttpError } from '../errors/http-error.js';
import { MarketGroupRepository } from '../persistence/market-group-repository.js';
import { AuthService } from '../services/auth-service.js';

interface MarketGroupsBody {
  groups?: unknown;
}

const GROUP_ID_PATTERN = /^[a-z0-9-]{2,32}$/;

export function registerMarketGroupRoutes(
  server: FastifyInstance,
  auth: AuthService,
  marketGroups: MarketGroupRepository,
): void {
  server.get('/api/market-groups', async (request) => {
    const user = await auth.requireCurrentUser(request);

    return {
      groups: await marketGroups.get(user.id),
    };
  });

  server.put('/api/market-groups', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const groups = readMarketGroups(request.body);

    await marketGroups.replace(user.id, groups);

    return reply.code(204).send();
  });
}

function readMarketGroups(body: unknown): MarketGroup[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'groups is required.');
  }

  const groups = (body as MarketGroupsBody).groups;

  if (!Array.isArray(groups) || groups.length < 1 || groups.length > 6) {
    throw new HttpError(400, 'groups must contain 1-6 market groups.');
  }

  const normalizedGroups = groups.map((group) => readMarketGroup(group));

  if (new Set(normalizedGroups.map((group) => group.id)).size !== normalizedGroups.length) {
    throw new HttpError(400, 'Market group IDs must be unique.');
  }

  return normalizedGroups;
}

function readMarketGroup(value: unknown): MarketGroup {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'A market group is invalid.');
  }

  const group = value as { id?: unknown; instruments?: unknown; name?: unknown };
  const id = readGroupId(group.id);
  const name = readString(group.name, 'market group name');

  if (!Array.isArray(group.instruments) || group.instruments.length < 1 || group.instruments.length > 12) {
    throw new HttpError(400, 'Each market group must contain 1-12 instruments.');
  }

  const instruments = group.instruments.map((instrument) => readInstrument(instrument));
  const identifiers = instruments.map((instrument) => `${instrument.exchange ?? ''}:${instrument.symbol}`);

  if (new Set(identifiers).size !== identifiers.length) {
    throw new HttpError(400, 'A market group cannot contain duplicate instruments.');
  }

  return { id, instruments, name };
}

function readGroupId(value: unknown): string {
  if (typeof value !== 'string' || !GROUP_ID_PATTERN.test(value)) {
    throw new HttpError(400, 'Market group ID is invalid.');
  }

  return value;
}

function readInstrument(value: unknown): InstrumentReference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'Instrument details are invalid.');
  }

  const instrument = value as { exchange?: unknown; name?: unknown; symbol?: unknown; type?: unknown };

  return {
    exchange: readNullableString(instrument.exchange, 'exchange'),
    name: readString(instrument.name, 'instrument name'),
    symbol: readString(instrument.symbol, 'symbol').toUpperCase(),
    type: readNullableString(instrument.type, 'type'),
  };
}

function readNullableString(value: unknown, name: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return readString(value, name);
}

function readString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${name} is required.`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > 128) {
    throw new HttpError(400, `${name} must contain 1-128 characters.`);
  }

  return normalizedValue;
}
