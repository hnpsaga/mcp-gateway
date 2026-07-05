import type { FastifyInstance } from 'fastify';

import type {
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
    async (request) => {
      const result = await fastify.executionEngine.executeTool(request.body as ExecuteToolRequest);
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
    async (request) => {
      const result = await fastify.executionEngine.readResource(
        request.body as ReadResourceRequest,
      );
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
    async (request) => {
      const result = await fastify.executionEngine.executePrompt(
        request.body as ExecutePromptRequest,
      );
      return createSuccessResponse(result);
    },
  );
}
