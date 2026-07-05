import { FastifyInstance } from 'fastify';

import { config } from './config/env.js';

export async function startServer(app: FastifyInstance): Promise<void> {
  const exitSignals = ['SIGINT', 'SIGTERM'];

  for (const signal of exitSignals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await app.close();
        app.log.info('Server closed successfully.');
        process.exit(0);
      } catch (err) {
        app.log.error(err as Error, 'Error during graceful shutdown');
        process.exit(1);
      }
    });
  }

  try {
    await app.listen({
      port: config.PORT,
      host: config.HOST,
    });
    app.log.info(`Server listening on http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err as Error, 'Error starting server');
    process.exit(1);
  }
}
