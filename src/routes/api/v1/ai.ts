import type { FastifyInstance } from 'fastify';

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.log.info('AI routes registered');
}
