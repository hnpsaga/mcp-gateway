import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../../app.js';

const validStdioConnection = {
  name: 'Test Connection',
  transportType: 'stdio',
  transportConfig: { command: 'node', args: ['server.js'] },
};

describe('Execution API', () => {
  describe('POST /api/v1/execution/tool - Execute Tool', () => {
    it('should execute a tool successfully', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: {
          connectionId,
          toolName: 'calculate',
          arguments: { expression: '2 + 2' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.connectionId).toBe(connectionId);
      expect(body.data.toolName).toBe('calculate');
      expect(body.data.arguments).toEqual({ expression: '2 + 2' });
      expect(body.data.status).toBe('success');
      expect(body.data.result).toBeDefined();
      expect(body.data.requestedAt).toBeDefined();
      expect(body.data.executedAt).toBeDefined();
      expect(body.data.error).toBeUndefined();

      await app.close();
    });

    it('should return normalized response without transport-specific fields', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: {
          connectionId,
          toolName: 'calculate',
          arguments: {},
        },
      });

      const body = response.json();
      expect(body.data.status).toBe('success');
      expect(body.data).not.toHaveProperty('success');
      expect(body.data.error).toBeUndefined();
      expect(new Date(body.data.requestedAt).getTime()).toBeGreaterThan(0);
      expect(new Date(body.data.executedAt).getTime()).toBeGreaterThan(0);

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: {
          connectionId: 'non-existent',
          toolName: 'calculate',
          arguments: {},
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');

      await app.close();
    });

    it('should return 404 for unknown tool', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: {
          connectionId,
          toolName: 'unknown_tool',
          arguments: {},
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');

      await app.close();
    });

    it('should return 400 for missing connectionId', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: { toolName: 'calculate', arguments: {} },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');

      await app.close();
    });

    it('should return 400 for missing toolName', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: { connectionId: 'test', arguments: {} },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it('should return 400 for missing arguments', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: { connectionId: 'test', toolName: 'calculate' },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it('should return 400 for empty body', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');

      await app.close();
    });
  });

  describe('POST /api/v1/execution/resource - Read Resource', () => {
    it('should read a resource successfully', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/resource',
        payload: {
          connectionId,
          resourceName: 'Config',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.connectionId).toBe(connectionId);
      expect(body.data.resourceName).toBe('Config');
      expect(body.data.status).toBe('success');
      expect(body.data.contents).toBeDefined();
      expect(body.data.requestedAt).toBeDefined();
      expect(body.data.executedAt).toBeDefined();
      expect(body.data.error).toBeUndefined();

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/resource',
        payload: {
          connectionId: 'non-existent',
          resourceName: 'Config',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');

      await app.close();
    });

    it('should return 404 for unknown resource', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/resource',
        payload: {
          connectionId,
          resourceName: 'unknown_resource',
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');

      await app.close();
    });

    it('should return 400 for missing connectionId', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/resource',
        payload: { resourceName: 'Config' },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it('should return 400 for missing resourceName', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/resource',
        payload: { connectionId: 'test' },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });
  });

  describe('POST /api/v1/execution/prompt - Execute Prompt', () => {
    it('should execute a prompt successfully', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/prompt',
        payload: {
          connectionId,
          promptName: 'analyze_code',
          arguments: { language: 'typescript' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.connectionId).toBe(connectionId);
      expect(body.data.promptName).toBe('analyze_code');
      expect(body.data.arguments).toEqual({ language: 'typescript' });
      expect(body.data.status).toBe('success');
      expect(body.data.result).toBeDefined();
      expect(body.data.requestedAt).toBeDefined();
      expect(body.data.executedAt).toBeDefined();
      expect(body.data.error).toBeUndefined();

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/prompt',
        payload: {
          connectionId: 'non-existent',
          promptName: 'analyze_code',
          arguments: {},
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');

      await app.close();
    });

    it('should return 404 for unknown prompt', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/prompt',
        payload: {
          connectionId,
          promptName: 'unknown_prompt',
          arguments: {},
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');

      await app.close();
    });

    it('should return 400 for missing arguments', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/prompt',
        payload: { connectionId: 'test', promptName: 'analyze_code' },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it('should return 400 for missing promptName', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/prompt',
        payload: { connectionId: 'test', arguments: {} },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });
  });

  describe('execution failure handling', () => {
    it('should return execution error when tool execution fails', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      vi.spyOn(app.executionEngine, 'executeTool').mockResolvedValue({
        connectionId,
        toolName: 'calculate',
        arguments: {},
        requestedAt: new Date(),
        executedAt: new Date(),
        status: 'error',
        error: {
          code: 'EXECUTION_ERROR',
          message: 'Tool execution timed out',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: {
          connectionId,
          toolName: 'calculate',
          arguments: {},
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('error');
      expect(body.data.error).toBeDefined();
      expect(body.data.error!.code).toBe('EXECUTION_ERROR');
      expect(body.data.error!.message).toBe('Tool execution timed out');
      expect(body.data.result).toBeUndefined();

      await app.close();
    });

    it('should return execution error when resource retrieval fails', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      vi.spyOn(app.executionEngine, 'readResource').mockResolvedValue({
        connectionId,
        resourceName: 'Config',
        requestedAt: new Date(),
        executedAt: new Date(),
        status: 'error',
        error: {
          code: 'EXECUTION_ERROR',
          message: 'Resource unavailable',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/resource',
        payload: {
          connectionId,
          resourceName: 'Config',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('error');
      expect(body.data.error!.message).toBe('Resource unavailable');

      await app.close();
    });

    it('should return execution error when prompt execution fails', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      vi.spyOn(app.executionEngine, 'executePrompt').mockResolvedValue({
        connectionId,
        promptName: 'analyze_code',
        arguments: {},
        requestedAt: new Date(),
        executedAt: new Date(),
        status: 'error',
        error: {
          code: 'EXECUTION_ERROR',
          message: 'Prompt execution failed',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/prompt',
        payload: {
          connectionId,
          promptName: 'analyze_code',
          arguments: {},
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('error');
      expect(body.data.error!.message).toBe('Prompt execution failed');

      await app.close();
    });
  });

  describe('OpenAPI documentation', () => {
    it('should include execution endpoints in the specification', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths).toBeDefined();

      await app.close();
    });

    it('should include execute tool endpoint', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths['/api/v1/execution/tool']).toBeDefined();
      expect(body.paths['/api/v1/execution/tool'].post).toBeDefined();

      await app.close();
    });

    it('should include read resource endpoint', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths['/api/v1/execution/resource']).toBeDefined();
      expect(body.paths['/api/v1/execution/resource'].post).toBeDefined();

      await app.close();
    });

    it('should include execute prompt endpoint', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths['/api/v1/execution/prompt']).toBeDefined();
      expect(body.paths['/api/v1/execution/prompt'].post).toBeDefined();

      await app.close();
    });
  });

  describe('error responses', () => {
    it('should use consistent error response format for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: {
          connectionId: 'non-existent',
          toolName: 'calculate',
          arguments: {},
        },
      });

      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(typeof body.error.message).toBe('string');

      await app.close();
    });

    it('should use consistent error response format for validation failures', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/execution/tool',
        payload: {},
      });

      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('VALIDATION_ERROR');

      await app.close();
    });
  });
});
