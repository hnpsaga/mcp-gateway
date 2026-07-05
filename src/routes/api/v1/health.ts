import { createRequire } from 'node:module';

import type { FastifyInstance } from 'fastify';

const require = createRequire(import.meta.url);
const { name: serviceName, version: appVersion } = require('../../../../package.json');

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              version: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      return {
        status: 'ok',
        service: serviceName,
        version: appVersion,
        timestamp: new Date().toISOString(),
      };
    },
  );
}
