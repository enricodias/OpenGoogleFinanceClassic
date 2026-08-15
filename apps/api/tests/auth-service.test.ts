import argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../src/config.js';
import type { Session, User } from '../src/domain/user.js';
import { UserRepository } from '../src/persistence/user-repository.js';
import { AuthService } from '../src/services/auth-service.js';

const SESSION_COOKIE_NAME = 'open_finance_session';

const user: User = {
  createdAt: '2026-07-27T12:00:00.000Z',
  id: 'user-a',
  passwordHash: null,
  updatedAt: '2026-07-27T12:00:00.000Z',
  username: 'trader',
};

async function hashForTest(password: string): Promise<string> {
  return argon2.hash(password, { memoryCost: 1024, parallelism: 1, timeCost: 2 });
}

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    allowRegistration: true,
    authenticationMode: 'required',
    encryptionKey: Buffer.alloc(32, 1),
    finnhubBaseUrl: 'https://finnhub.example',
    logoDevBaseUrl: 'https://logo.example',
    massiveBaseUrl: 'https://massive.example',
    nodeEnvironment: 'test',
    port: 4000,
    providerRequestTimeoutMs: 5000,
    redisUrl: 'redis://localhost:6379',
    sessionTtlSeconds: 3600,
    twelveDataBaseUrl: 'https://twelve.example',
    useSecureCookies: false,
    ...overrides,
  };
}

function buildRequest(sessionId?: string): FastifyRequest {
  return {
    cookies: sessionId === undefined ? {} : { [SESSION_COOKIE_NAME]: sessionId },
  } as unknown as FastifyRequest;
}

describe('AuthService authorization boundaries', () => {
  it('rejects a request without a session cookie', async () => {
    const users = {} as UserRepository;
    const auth = new AuthService(buildConfig(), users);

    await expect(auth.requireCurrentUser(buildRequest())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a session cookie that no longer exists', async () => {
    const users = {
      findSession: vi.fn(async () => null),
    } as unknown as UserRepository;
    const auth = new AuthService(buildConfig(), users);

    await expect(auth.requireCurrentUser(buildRequest('missing-session'))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('resolves the user that owns a valid session', async () => {
    const session: Session = { createdAt: user.createdAt, id: 'session-a', userId: user.id };
    const users = {
      findSession: vi.fn(async () => session),
      findUserById: vi.fn(async () => user),
    } as unknown as UserRepository;
    const auth = new AuthService(buildConfig(), users);

    await expect(auth.requireCurrentUser(buildRequest('session-a'))).resolves.toEqual(user);
  });

  it('never mixes up users between two different sessions', async () => {
    const otherUser: User = { ...user, id: 'user-b', username: 'other-trader' };
    const sessions: Record<string, Session> = {
      'session-a': { createdAt: user.createdAt, id: 'session-a', userId: user.id },
      'session-b': { createdAt: user.createdAt, id: 'session-b', userId: otherUser.id },
    };
    const users = {
      findSession: vi.fn(async (id: string) => sessions[id] ?? null),
      findUserById: vi.fn(async (id: string) => [user, otherUser].find((candidate) => candidate.id === id) ?? null),
    } as unknown as UserRepository;
    const auth = new AuthService(buildConfig(), users);

    await expect(auth.requireCurrentUser(buildRequest('session-a'))).resolves.toEqual(user);
    await expect(auth.requireCurrentUser(buildRequest('session-b'))).resolves.toEqual(otherUser);
  });

  it('bypasses sessions entirely and resolves the shared local user when authentication is disabled', async () => {
    const localUser: User = { ...user, id: 'local', username: 'local' };
    const users = {
      ensureLocalUser: vi.fn(async () => localUser),
    } as unknown as UserRepository;
    const auth = new AuthService(buildConfig({ authenticationMode: 'disabled' }), users);

    await expect(auth.getCurrentUser(buildRequest())).resolves.toEqual(localUser);
    expect(users.ensureLocalUser).toHaveBeenCalledTimes(1);
  });

  it('login rejects an unknown username', async () => {
    const users = {
      findUserByUsername: vi.fn(async () => null),
    } as unknown as UserRepository;
    const auth = new AuthService(buildConfig(), users);
    const replyMock = { setCookie: vi.fn() };
    const reply = replyMock as unknown as FastifyReply;

    await expect(auth.login('nobody', 'a-random-password', reply)).rejects.toMatchObject({ statusCode: 401 });
    expect(replyMock.setCookie).not.toHaveBeenCalled();
  });

  it('login rejects an incorrect password', async () => {
    const passwordHash = await hashForTest('the-correct-password');
    const users = {
      findUserByUsername: vi.fn(async () => ({ ...user, passwordHash })),
    } as unknown as UserRepository;
    const auth = new AuthService(buildConfig(), users);
    const replyMock = { setCookie: vi.fn() };
    const reply = replyMock as unknown as FastifyReply;

    await expect(auth.login('trader', 'the-wrong-password', reply)).rejects.toMatchObject({ statusCode: 401 });
    expect(replyMock.setCookie).not.toHaveBeenCalled();
  });
});

describe('AuthService.changePassword', () => {
  it('rejects password changes when authentication is disabled', async () => {
    const users = {} as UserRepository;
    const auth = new AuthService(buildConfig({ authenticationMode: 'disabled' }), users);

    await expect(auth.changePassword(buildRequest(), 'current-password', 'a-brand-new-password'))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects an unauthenticated request', async () => {
    const users = {} as UserRepository;
    const auth = new AuthService(buildConfig(), users);

    await expect(auth.changePassword(buildRequest(), 'current-password', 'a-brand-new-password'))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an incorrect current password without touching the stored hash', async () => {
    const passwordHash = await hashForTest('the-real-password');
    const session: Session = { createdAt: user.createdAt, id: 'session-a', userId: user.id };
    const users = {
      findSession: vi.fn(async () => session),
      findUserById: vi.fn(async () => ({ ...user, passwordHash })),
      updatePasswordHash: vi.fn(async () => undefined),
    } as unknown as UserRepository;
    const auth = new AuthService(buildConfig(), users);

    await expect(auth.changePassword(buildRequest('session-a'), 'the-wrong-password', 'a-brand-new-password'))
      .rejects.toMatchObject({ statusCode: 401 });
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('rejects a new password that is too short', async () => {
    const passwordHash = await hashForTest('the-real-password');
    const session: Session = { createdAt: user.createdAt, id: 'session-a', userId: user.id };
    const users = {
      findSession: vi.fn(async () => session),
      findUserById: vi.fn(async () => ({ ...user, passwordHash })),
      updatePasswordHash: vi.fn(async () => undefined),
    } as unknown as UserRepository;
    const auth = new AuthService(buildConfig(), users);

    await expect(auth.changePassword(buildRequest('session-a'), 'the-real-password', 'too-short'))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('hashes and stores the new password once the current password is verified', async () => {
    const passwordHash = await hashForTest('the-real-password');
    const session: Session = { createdAt: user.createdAt, id: 'session-a', userId: user.id };
    const users = {
      findSession: vi.fn(async () => session),
      findUserById: vi.fn(async () => ({ ...user, passwordHash })),
      updatePasswordHash: vi.fn(async () => undefined),
    } as unknown as UserRepository;
    const auth = new AuthService(buildConfig(), users);

    await auth.changePassword(buildRequest('session-a'), 'the-real-password', 'a-brand-new-password');

    expect(users.updatePasswordHash).toHaveBeenCalledTimes(1);
    const call = vi.mocked(users.updatePasswordHash).mock.calls[0];
    const calledUserId = call?.[0];
    const newHash = call?.[1];
    expect(calledUserId).toBe(user.id);
    expect(newHash).not.toBe(passwordHash);
    await expect(argon2.verify(newHash as string, 'a-brand-new-password')).resolves.toBe(true);
  });
});
