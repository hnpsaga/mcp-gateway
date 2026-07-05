import type { FastifyInstance } from 'fastify';

export async function discoveryRoutes(fastify: FastifyInstance) {
  fastify.log.info('Discovery routes registered');
}
