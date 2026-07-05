import { createRequire } from 'node:module';

import { FastifyInstance } from 'fastify';

const require = createRequire(import.meta.url);
const { name: serviceName, version: appVersion } = require('../../package.json');

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      service: serviceName,
      version: appVersion,
      timestamp: new Date().toISOString(),
    };
  });
}
