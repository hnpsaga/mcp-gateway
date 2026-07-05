import type { FastifyInstance } from 'fastify';

import { aiRoutes } from './ai.js';
import { connectionRoutes } from './connections.js';
import { discoveryRoutes } from './discovery.js';
import { executionRoutes } from './execution.js';
import { healthRoutes } from './health.js';
import { operationsRoutes } from './operations.js';

export async function v1Routes(fastify: FastifyInstance) {
  await fastify.register(healthRoutes);
  await fastify.register(connectionRoutes, { prefix: '/connections' });
  await fastify.register(discoveryRoutes);
  await fastify.register(executionRoutes);
  await fastify.register(aiRoutes);
  await fastify.register(operationsRoutes);
}
