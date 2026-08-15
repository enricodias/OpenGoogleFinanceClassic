import argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from '../config.js';
import type { User } from '../domain/user.js';
import { HttpError } from '../errors/http-error.js';
import { UserRepository } from '../persistence/user-repository.js';

const SESSION_COOKIE_NAME = 'open_finance_session';
const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/;

export class AuthService {
  public constructor(
    private readonly config: AppConfig,
    private readonly users: UserRepository,
  ) {}

  public get authenticationMode(): AppConfig['authenticationMode'] {
    return this.config.authenticationMode;
  }

  public async getCurrentUser(request: FastifyRequest): Promise<User | null> {
    if (this.config.authenticationMode === 'disabled') {
      return this.users.ensureLocalUser();
    }

    const sessionId = request.cookies[SESSION_COOKIE_NAME];

    if (sessionId === undefined) {
      return null;
    }

    const session = await this.users.findSession(sessionId);

    if (session === null) {
      return null;
    }

    return this.users.findUserById(session.userId);
  }

  public async login(
    usernameInput: string,
    password: string,
    reply: FastifyReply,
  ): Promise<User> {
    const username = this.normalizeUsername(usernameInput);
    const user = await this.users.findUserByUsername(username);

    if (user === null || user.passwordHash === null) {
      throw new HttpError(401, 'Invalid username or password.');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, password);

    if (!passwordMatches) {
      throw new HttpError(401, 'Invalid username or password.');
    }

    await this.startSession(user, reply);

    return user;
  }

  public async logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const sessionId = request.cookies[SESSION_COOKIE_NAME];

    if (sessionId !== undefined) {
      await this.users.deleteSession(sessionId);
    }

    reply.clearCookie(SESSION_COOKIE_NAME, this.cookieOptions());
  }

  public async changePassword(
    request: FastifyRequest,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (this.config.authenticationMode === 'disabled') {
      throw new HttpError(403, 'Password changes are not available for this deployment.');
    }

    const user = await this.requireCurrentUser(request);

    if (user.passwordHash === null) {
      throw new HttpError(401, 'Current password is incorrect.');
    }

    const currentPasswordMatches = await argon2.verify(user.passwordHash, currentPassword);

    if (!currentPasswordMatches) {
      throw new HttpError(401, 'Current password is incorrect.');
    }

    this.validatePassword(newPassword);

    await this.users.updatePasswordHash(user.id, await this.hashPassword(newPassword));
  }

  public async register(
    usernameInput: string,
    password: string,
    reply: FastifyReply,
  ): Promise<User> {
    if (this.config.authenticationMode === 'disabled') {
      throw new HttpError(403, 'Registration is disabled for this deployment.');
    }

    if (!this.config.allowRegistration) {
      throw new HttpError(403, 'Registration is disabled for this deployment.');
    }

    const username = this.normalizeUsername(usernameInput);
    this.validatePassword(password);

    const passwordHash = await this.hashPassword(password);
    const user = await this.users.createUser(username, passwordHash);

    if (user === null) {
      throw new HttpError(409, 'That username is already in use.');
    }

    await this.startSession(user, reply);

    return user;
  }

  public async requireCurrentUser(request: FastifyRequest): Promise<User> {
    const user = await this.getCurrentUser(request);

    if (user === null) {
      throw new HttpError(401, 'Authentication is required.');
    }

    return user;
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      memoryCost: 19456,
      parallelism: 1,
      timeCost: 3,
      type: argon2.argon2id,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      path: '/',
      sameSite: 'lax' as const,
      secure: this.config.useSecureCookies,
    };
  }

  private normalizeUsername(value: string): string {
    const username = value.trim().toLowerCase();

    if (!USERNAME_PATTERN.test(username)) {
      throw new HttpError(400, 'Username must contain 3-32 lowercase letters, numbers, hyphens, or underscores.');
    }

    return username;
  }

  private async startSession(user: User, reply: FastifyReply): Promise<void> {
    const session = await this.users.createSession(user.id, this.config.sessionTtlSeconds);

    reply.setCookie(SESSION_COOKIE_NAME, session.id, {
      ...this.cookieOptions(),
      maxAge: this.config.sessionTtlSeconds,
    });
  }

  private validatePassword(password: string): void {
    if (password.length < 12 || password.length > 256) {
      throw new HttpError(400, 'Password must contain 12-256 characters.');
    }
  }
}
