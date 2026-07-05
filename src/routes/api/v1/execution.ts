import type { FastifyInstance } from 'fastify';

import type {
  ExecuteCompleteRequest,
  ExecutePromptRequest,
  ExecuteToolRequest,
  ReadResourceRequest,
} from '../../../execution/execution-types.js';
import { createSuccessResponse } from '../../../lib/api/response.js';

const executionErrorSchema = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    details: { type: 'object' },
  },
};

const executeToolDataSchema = {
  type: 'object',
  properties: {
    connectionId: { type: 'string' },
    toolName: { type: 'string' },
    arguments: { type: 'object', additionalProperties: true },
    requestedAt: { type: 'string', format: 'date-time' },
    executedAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['success', 'error'] },
    result: { type: 'object', additionalProperties: true },
    error: executionErrorSchema,
  },
};

const readResourceDataSchema = {
  type: 'object',
  properties: {
    connectionId: { type: 'string' },
    resourceName: { type: 'string' },
    requestedAt: { type: 'string', format: 'date-time' },
    executedAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['success', 'error'] },
    contents: { type: 'object', additionalProperties: true },
    error: executionErrorSchema,
  },
};

const executePromptDataSchema = {
  type: 'object',
  properties: {
    connectionId: { type: 'string' },
    promptName: { type: 'string' },
    arguments: { type: 'object', additionalProperties: true },
    requestedAt: { type: 'string', format: 'date-time' },
    executedAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['success', 'error'] },
    result: { type: 'object', additionalProperties: true },
    error: executionErrorSchema,
  },
};

const executeCompleteDataSchema = {
  type: 'object',
  properties: {
    connectionId: { type: 'string' },
    requestedAt: { type: 'string', format: 'date-time' },
    executedAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['success', 'error'] },
    result: { type: 'object', additionalProperties: true },
    error: executionErrorSchema,
  },
};

const executeToolBodySchema = {
  type: 'object',
  required: ['connectionId', 'toolName', 'arguments'],
  properties: {
    connectionId: { type: 'string', minLength: 1 },
    toolName: { type: 'string', minLength: 1 },
    arguments: { type: 'object', additionalProperties: true },
  },
};

const readResourceBodySchema = {
  type: 'object',
  required: ['connectionId', 'resourceName'],
  properties: {
    connectionId: { type: 'string', minLength: 1 },
    resourceName: { type: 'string', minLength: 1 },
  },
};

const executePromptBodySchema = {
  type: 'object',
  required: ['connectionId', 'promptName', 'arguments'],
  properties: {
    connectionId: { type: 'string', minLength: 1 },
    promptName: { type: 'string', minLength: 1 },
    arguments: { type: 'object', additionalProperties: true },
  },
};

const executeCompleteBodySchema = {
  type: 'object',
  required: ['connectionId', 'ref', 'argument'],
  properties: {
    connectionId: { type: 'string', minLength: 1 },
    ref: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['ref/prompt', 'ref/resource'] },
        name: { type: 'string' },
        uri: { type: 'string' },
      },
    },
    argument: {
      type: 'object',
      required: ['name', 'value'],
      properties: {
        name: { type: 'string' },
        value: { type: 'string' },
      },
    },
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

export async function executionRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/execution/tool',
    {
      schema: {
        body: executeToolBodySchema,
        response: {
          200: successResponse(executeToolDataSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const abortController = new AbortController();
      request.raw.on('close', () => {
        if (!reply.raw.writableEnded) {
          abortController.abort();
        }
      });

      const body = request.body as ExecuteToolRequest;
      const result = await fastify.executionEngine.executeTool({
        ...body,
        abortSignal: abortController.signal,
      });
      return createSuccessResponse(result);
    },
  );

  fastify.post(
    '/execution/resource',
    {
      schema: {
        body: readResourceBodySchema,
        response: {
          200: successResponse(readResourceDataSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const abortController = new AbortController();
      request.raw.on('close', () => {
        if (!reply.raw.writableEnded) {
          abortController.abort();
        }
      });

      const body = request.body as ReadResourceRequest;
      const result = await fastify.executionEngine.readResource({
        ...body,
        abortSignal: abortController.signal,
      });
      return createSuccessResponse(result);
    },
  );

  fastify.post(
    '/execution/prompt',
    {
      schema: {
        body: executePromptBodySchema,
        response: {
          200: successResponse(executePromptDataSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const abortController = new AbortController();
      request.raw.on('close', () => {
        if (!reply.raw.writableEnded) {
          abortController.abort();
        }
      });

      const body = request.body as ExecutePromptRequest;
      const result = await fastify.executionEngine.executePrompt({
        ...body,
        abortSignal: abortController.signal,
      });
      return createSuccessResponse(result);
    },
  );

  fastify.post(
    '/execution/complete',
    {
      schema: {
        body: executeCompleteBodySchema,
        response: {
          200: successResponse(executeCompleteDataSchema),
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const abortController = new AbortController();
      request.raw.on('close', () => {
        if (!reply.raw.writableEnded) {
          abortController.abort();
        }
      });

      const body = request.body as ExecuteCompleteRequest;
      const result = await fastify.executionEngine.complete({
        ...body,
      });
      return createSuccessResponse(result);
    },
  );
}
