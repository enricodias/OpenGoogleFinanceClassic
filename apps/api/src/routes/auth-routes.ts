import type { FastifyInstance } from 'fastify';

import { HttpError } from '../errors/http-error.js';
import { AuthService } from '../services/auth-service.js';

interface AuthenticationBody {
  password?: unknown;
  username?: unknown;
}

export function registerAuthRoutes(server: FastifyInstance, auth: AuthService): void {
  server.get('/api/auth/session', async (request) => {
    const user = await auth.getCurrentUser(request);

    return {
      authenticated: user !== null,
      authenticationMode: auth.authenticationMode,
      user: user === null ? null : publicUser(user),
    };
  });

  server.post('/api/auth/register', async (request, reply) => {
    const body = request.body as AuthenticationBody;
    const user = await auth.register(readUsername(body), readPassword(body), reply);

    return {
      user: publicUser(user),
    };
  });

  server.post('/api/auth/login', async (request, reply) => {
    const body = request.body as AuthenticationBody;
    const user = await auth.login(readUsername(body), readPassword(body), reply);

    return {
      user: publicUser(user),
    };
  });

  server.post('/api/auth/logout', async (request, reply) => {
    await auth.logout(request, reply);

    return reply.code(204).send();
  });
}

function publicUser(user: { id: string; username: string }) {
  return {
    id: user.id,
    username: user.username,
  };
}

function readPassword(body: AuthenticationBody): string {
  if (typeof body.password !== 'string') {
    throw new HttpError(400, 'Password is required.');
  }

  return body.password;
}

function readUsername(body: AuthenticationBody): string {
  if (typeof body.username !== 'string') {
    throw new HttpError(400, 'Username is required.');
  }

  return body.username;
}
