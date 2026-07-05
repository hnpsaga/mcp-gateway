import type { FastifyInstance } from 'fastify';

import { createSuccessResponse } from '../../../lib/api/response.js';

const toolSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    inputSchema: { type: 'object', additionalProperties: true },
  },
};

const resourceSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    uri: { type: 'string' },
    description: { type: 'string' },
    mimeType: { type: 'string' },
  },
};

const promptArgumentSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    required: { type: 'boolean' },
  },
};

const promptSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    arguments: { type: 'array', items: promptArgumentSchema },
  },
};

const discoveryResultSchema = {
  type: 'object',
  properties: {
    connectionId: { type: 'string' },
    tools: { type: 'array', items: toolSchema },
    resources: { type: 'array', items: resourceSchema },
    prompts: { type: 'array', items: promptSchema },
    discoveredAt: { type: 'string', format: 'date-time' },
  },
};

const cachedSummarySchema = {
  type: 'object',
  properties: {
    connectionId: { type: 'string' },
    discoveredAt: { type: 'string', format: 'date-time' },
    toolsCount: { type: 'number' },
    resourcesCount: { type: 'number' },
    promptsCount: { type: 'number' },
  },
};

const paramsSchema = {
  type: 'object',
  required: ['connectionId'],
  properties: {
    connectionId: { type: 'string', minLength: 1 },
  },
};

const messageSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
  },
};

function successResponse(dataSchema: Record<string, unknown>) {
  return {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: dataSchema,
    },
  };
}

const errorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object' },
      },
    },
  },
};

export async function discoveryRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { connectionId: string } }>(
    '/discovery/:connectionId',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponse(discoveryResultSchema),
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      const result = fastify.discoveryEngine.getCached(connectionId);
      return createSuccessResponse(result);
    },
  );

  fastify.post<{ Params: { connectionId: string } }>(
    '/discovery/:connectionId',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponse(discoveryResultSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      const result = await fastify.discoveryEngine.discover(connectionId);
      return createSuccessResponse(result);
    },
  );

  fastify.post<{ Params: { connectionId: string } }>(
    '/discovery/:connectionId/refresh',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponse(discoveryResultSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      const result = await fastify.discoveryEngine.refresh(connectionId);
      return createSuccessResponse(result);
    },
  );

  fastify.delete<{ Params: { connectionId: string } }>(
    '/discovery/:connectionId',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponse(messageSchema),
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      fastify.discoveryEngine.clearCache(connectionId);
      return createSuccessResponse({
        message: `Discovery cache cleared for connection '${connectionId}'`,
      });
    },
  );

  fastify.get(
    '/discovery',
    {
      schema: {
        response: {
          200: successResponse({
            type: 'array',
            items: cachedSummarySchema,
          }),
        },
      },
    },
    async () => {
      const summaries = fastify.discoveryEngine.listCachedSummaries();
      return createSuccessResponse(summaries);
    },
  );
}
