import type { FastifyInstance } from 'fastify';

import { toHttpError } from '../services/market-data-service.js';
import { AuthService } from '../services/auth-service.js';
import { HomeService } from '../services/home-service.js';

export function registerHomeRoutes(
  server: FastifyInstance,
  auth: AuthService,
  home: HomeService,
): void {
  server.get('/api/home', async (request) => {
    const user = await auth.requireCurrentUser(request);

    try {
      return await home.getHome(user.id);
    } catch (error) {
      return toHttpError(error);
    }
  });
}
