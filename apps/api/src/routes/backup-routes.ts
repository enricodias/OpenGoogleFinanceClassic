import type { FastifyInstance } from 'fastify';

import { AuthService } from '../services/auth-service.js';
import { BackupService } from '../services/backup-service.js';

export function registerBackupRoutes(
  server: FastifyInstance,
  auth: AuthService,
  backups: BackupService,
): void {
  server.get('/api/backup', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);
    const backup = await backups.create(user.id);
    const date = backup.exportedAt.slice(0, 10);

    reply.header('Content-Disposition', `attachment; filename="open-finance-classic-${date}.json"`);

    return backup;
  });

  server.post('/api/backup/restore', async (request, reply) => {
    const user = await auth.requireCurrentUser(request);

    await backups.restore(user.id, request.body);

    return reply.code(204).send();
  });
}
