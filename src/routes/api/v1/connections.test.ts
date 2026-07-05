import { describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';

const validStdioConnection = {
  name: 'Test Connection',
  transportType: 'stdio',
  transportConfig: { command: 'node', args: ['server.js'] },
};

const validHttpConnection = {
  name: 'HTTP Connection',
  transportType: 'streamable-http',
  transportConfig: { url: 'http://localhost:8080/mcp' },
};

describe('Connection Management API', () => {
  describe('POST /api/v1/connections - Create Connection', () => {
    it('should create a stdio connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe('Test Connection');
      expect(body.data.transportType).toBe('stdio');
      expect(body.data.transportConfig).toEqual({ command: 'node', args: ['server.js'] });
      expect(body.data.enabled).toBe(true);
      expect(body.data.tags).toEqual([]);
      expect(body.data.metadata).toEqual({});
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();

      await app.close();
    });

    it('should create an HTTP connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validHttpConnection,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.transportType).toBe('streamable-http');
      expect(body.data.transportConfig).toEqual({ url: 'http://localhost:8080/mcp' });

      await app.close();
    });

    it('should accept a custom ID', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, id: 'my-custom-id' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.id).toBe('my-custom-id');

      await app.close();
    });

    it('should preserve optional fields', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: {
          ...validStdioConnection,
          description: 'My test connection',
          enabled: false,
          tags: ['production', 'database'],
          metadata: { environment: 'prod' },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json().data;
      expect(body.description).toBe('My test connection');
      expect(body.enabled).toBe(false);
      expect(body.tags).toEqual(['production', 'database']);
      expect(body.metadata).toEqual({ environment: 'prod' });

      await app.close();
    });

    it('should return 400 for duplicate ID', async () => {
      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, id: 'dup-id' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, id: 'dup-id' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');

      await app.close();
    });

    it('should return 400 for missing required fields', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().success).toBe(false);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');

      await app.close();
    });

    it('should return 400 for missing name', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { transportType: 'stdio', transportConfig: {} },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it('should return 400 for invalid transport type', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { name: 'Test', transportType: 'invalid', transportConfig: {} },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it('should return 400 for stdio without command', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: {
          name: 'Test',
          transportType: 'stdio',
          transportConfig: { args: ['server.js'] },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');

      await app.close();
    });

    it('should ignore extra fields in body', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, extraField: 'should-be-ignored' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.name).toBe('Test Connection');

      await app.close();
    });
  });

  describe('GET /api/v1/connections - List Connections', () => {
    it('should return all connections', async () => {
      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, id: 'conn-1' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validHttpConnection, id: 'conn-2' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/connections',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe('conn-1');
      expect(body.data[1].id).toBe('conn-2');

      await app.close();
    });

    it('should return empty array when no connections exist', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/connections',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([]);

      await app.close();
    });

    it('should not include runtime lifecycle state', async () => {
      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/connections',
      });

      const body = response.json();
      expect(body.data[0]).not.toHaveProperty('status');
      expect(body.data[0]).not.toHaveProperty('runtimeState');

      await app.close();
    });
  });

  describe('GET /api/v1/connections/:connectionId - Get Connection', () => {
    it('should return a connection by ID', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, id: 'get-test' },
      });
      const createdId = createRes.json().data.id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/connections/${createdId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.id).toBe(createdId);
      expect(response.json().data.name).toBe('Test Connection');

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/connections/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');

      await app.close();
    });
  });

  describe('PUT /api/v1/connections/:connectionId - Update Connection', () => {
    it('should update a connection', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const id = createRes.json().data.id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/connections/${id}`,
        payload: { name: 'Updated Name', description: 'Updated description' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.name).toBe('Updated Name');
      expect(body.data.description).toBe('Updated description');

      await app.close();
    });

    it('should update transport type and config', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const id = createRes.json().data.id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/connections/${id}`,
        payload: {
          transportType: 'streamable-http',
          transportConfig: { url: 'http://example.com/mcp' },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.transportType).toBe('streamable-http');
      expect(response.json().data.transportConfig).toEqual({
        url: 'http://example.com/mcp',
      });

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/connections/non-existent',
        payload: { name: 'New Name' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');

      await app.close();
    });

    it('should return 400 for invalid update data', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const id = createRes.json().data.id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/connections/${id}`,
        payload: { transportType: 'streamable-http', transportConfig: {} },
      });

      expect(response.statusCode).toBe(400);

      await app.close();
    });

    it('should ignore extra fields in update body', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const id = createRes.json().data.id;

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/connections/${id}`,
        payload: { name: 'Updated', extraField: 'not-allowed' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.name).toBe('Updated');

      await app.close();
    });
  });

  describe('DELETE /api/v1/connections/:connectionId - Delete Connection', () => {
    it('should delete a connection', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const id = createRes.json().data.id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/connections/${id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.message).toContain(id);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/connections/${id}`,
      });
      expect(getRes.statusCode).toBe(404);

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/connections/non-existent',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');

      await app.close();
    });
  });

  describe('POST /api/v1/connections/:connectionId/enable - Enable Connection', () => {
    it('should enable a disabled connection', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, enabled: false },
      });
      const id = createRes.json().data.id;
      expect(createRes.json().data.enabled).toBe(false);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/connections/${id}/enable`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.enabled).toBe(true);

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections/non-existent/enable',
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('POST /api/v1/connections/:connectionId/disable - Disable Connection', () => {
    it('should disable an enabled connection', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const id = createRes.json().data.id;
      expect(createRes.json().data.enabled).toBe(true);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/connections/${id}/disable`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.enabled).toBe(false);

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections/non-existent/disable',
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('POST /api/v1/connections/:connectionId/test - Test Connection', () => {
    it('should return valid for enabled connection', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const id = createRes.json().data.id;

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/connections/${id}/test`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.status).toBe('valid');
      expect(body.data.connectionId).toBe(id);
      expect(body.data.message).toBeDefined();

      await app.close();
    });

    it('should return 400 for disabled connection', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, enabled: false },
      });
      const id = createRes.json().data.id;

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/connections/${id}/test`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/connections/non-existent/test',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');

      await app.close();
    });
  });

  describe('OpenAPI documentation', () => {
    it('should include connection endpoints in the specification', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths).toBeDefined();
      expect(body.paths['/api/v1/connections/']).toBeDefined();
      expect(body.paths['/api/v1/connections/'].post).toBeDefined();
      expect(body.paths['/api/v1/connections/'].get).toBeDefined();

      await app.close();
    });

    it('should include connection detail endpoints', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths['/api/v1/connections/{connectionId}']).toBeDefined();
      expect(body.paths['/api/v1/connections/{connectionId}'].get).toBeDefined();
      expect(body.paths['/api/v1/connections/{connectionId}'].put).toBeDefined();
      expect(body.paths['/api/v1/connections/{connectionId}'].delete).toBeDefined();

      await app.close();
    });

    it('should include enable/disable/test endpoints', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths['/api/v1/connections/{connectionId}/enable']).toBeDefined();
      expect(body.paths['/api/v1/connections/{connectionId}/disable']).toBeDefined();
      expect(body.paths['/api/v1/connections/{connectionId}/test']).toBeDefined();

      await app.close();
    });
  });
});
