import type { FastifyInstance } from 'fastify';

import type {
  CreateConnectionInput,
  UpdateConnectionInput,
} from '../../../connections/connection.js';
import { createConnectionSchema } from '../../../connections/connection-schema.js';
import { createSuccessResponse } from '../../../lib/api/response.js';
import { ValidationError } from '../../../shared/errors/index.js';

const connectionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    transportType: { type: 'string', enum: ['stdio', 'streamable-http'] },
    transportConfig: { type: 'object', additionalProperties: true },
    enabled: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    metadata: { type: 'object', additionalProperties: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const connectionListSchema = {
  type: 'array',
  items: connectionSchema,
};

const createConnectionBodySchema = {
  type: 'object',
  required: ['name', 'transportType', 'transportConfig'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    transportType: { type: 'string', enum: ['stdio', 'streamable-http'] },
    transportConfig: { type: 'object' },
    enabled: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    metadata: { type: 'object' },
  },
};

const updateConnectionBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    transportType: { type: 'string', enum: ['stdio', 'streamable-http'] },
    transportConfig: { type: 'object' },
    enabled: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    metadata: { type: 'object' },
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

const testResultSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    connectionId: { type: 'string' },
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

export async function connectionRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/',
    {
      schema: {
        body: createConnectionBodySchema,
        response: {
          201: successResponse(connectionSchema),
          400: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const connection = await fastify.connectionRegistry.register(
        request.body as CreateConnectionInput,
      );
      return reply.code(201).send(createSuccessResponse(connection));
    },
  );

  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: successResponse(connectionListSchema),
        },
      },
    },
    async () => {
      const connections = await fastify.connectionRegistry.list();
      return createSuccessResponse(connections);
    },
  );

  fastify.get<{ Params: { connectionId: string } }>(
    '/:connectionId',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponse(connectionSchema),
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      const connection = await fastify.connectionRegistry.get(connectionId);
      return createSuccessResponse(connection);
    },
  );

  fastify.put<{ Params: { connectionId: string } }>(
    '/:connectionId',
    {
      schema: {
        params: paramsSchema,
        body: updateConnectionBodySchema,
        response: {
          200: successResponse(connectionSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      const connection = await fastify.connectionRegistry.update(
        connectionId,
        request.body as UpdateConnectionInput,
      );
      return createSuccessResponse(connection);
    },
  );

  fastify.delete<{ Params: { connectionId: string } }>(
    '/:connectionId',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponse(messageSchema),
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      await fastify.connectionRegistry.remove(connectionId);
      return createSuccessResponse({
        message: `Connection '${connectionId}' deleted`,
      });
    },
  );

  fastify.post<{ Params: { connectionId: string } }>(
    '/:connectionId/enable',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponse(connectionSchema),
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      const connection = await fastify.connectionRegistry.enable(connectionId);
      return createSuccessResponse(connection);
    },
  );

  fastify.post<{ Params: { connectionId: string } }>(
    '/:connectionId/disable',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponse(connectionSchema),
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      const connection = await fastify.connectionRegistry.disable(connectionId);
      return createSuccessResponse(connection);
    },
  );

  fastify.post<{ Params: { connectionId: string } }>(
    '/:connectionId/test',
    {
      schema: {
        params: paramsSchema,
        response: {
          200: successResponse(testResultSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { connectionId } = request.params;
      const connection = await fastify.connectionRegistry.get(connectionId);

      if (!connection.enabled) {
        throw new ValidationError('Connection is not enabled', {
          connectionId,
        });
      }

      const parseResult = createConnectionSchema.safeParse({
        name: connection.name,
        description: connection.description,
        transportType: connection.transportType,
        transportConfig: connection.transportConfig,
        enabled: connection.enabled,
        tags: connection.tags,
        metadata: connection.metadata,
      });

      if (!parseResult.success) {
        throw new ValidationError('Connection configuration is invalid', parseResult.error.issues);
      }

      return createSuccessResponse({
        status: 'valid',
        connectionId,
        message: 'Connection definition is valid and ready for transport initialization',
      });
    },
  );
}
