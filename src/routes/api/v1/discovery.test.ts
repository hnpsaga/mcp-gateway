import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildApp } from '../../../app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mockServerPath = join(
  __dirname,
  '..',
  '..',
  '..',
  'transport',
  'test-utils',
  'mock-mcp-server.ts',
);

const validStdioConnection = {
  name: 'Test Connection',
  transportType: 'stdio',
  transportConfig: { command: 'npx', args: ['tsx', mockServerPath] },
};

describe('Discovery API', () => {
  describe('POST /api/v1/discovery/:connectionId - Discover Capabilities', () => {
    it('should discover capabilities and return cached result', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.transport.connect(connectionId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.connectionId).toBe(connectionId);
      expect(body.data.tools).toBeInstanceOf(Array);
      expect(body.data.resources).toBeInstanceOf(Array);
      expect(body.data.prompts).toBeInstanceOf(Array);
      expect(body.data.discoveredAt).toBeDefined();

      await app.transport.disconnect(connectionId);
      await app.close();
    });

    it('should return 500 for non-connected transport', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      expect(response.statusCode).toBe(500);

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/discovery/non-existent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');

      await app.close();
    });
  });

  describe('GET /api/v1/discovery/:connectionId - Get Cached Discovery', () => {
    it('should return cached discovery results', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.transport.connect(connectionId);
      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/discovery/${connectionId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.connectionId).toBe(connectionId);
      expect(body.data.tools.length).toBeGreaterThan(0);
      expect(body.data.resources.length).toBeGreaterThan(0);
      expect(body.data.prompts.length).toBeGreaterThan(0);

      await app.transport.disconnect(connectionId);
      await app.close();
    });

    it('should return 404 when discovery has never been performed', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/discovery/${connectionId}`,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');

      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/discovery/non-existent',
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('POST /api/v1/discovery/:connectionId/refresh - Refresh Discovery', () => {
    it('should force a new discovery and return refreshed capabilities', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.transport.connect(connectionId);

      const firstRes = await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });
      const firstTimestamp = firstRes.json().data.discoveredAt;

      await new Promise((resolve) => setTimeout(resolve, 5));

      const refreshRes = await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}/refresh`,
      });

      expect(refreshRes.statusCode).toBe(200);
      const body = refreshRes.json();
      expect(body.success).toBe(true);
      expect(body.data.connectionId).toBe(connectionId);
      expect(body.data.discoveredAt).not.toBe(firstTimestamp);

      await app.transport.disconnect(connectionId);
      await app.close();
    });

    it('should return 404 for unknown connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/discovery/non-existent/refresh',
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('DELETE /api/v1/discovery/:connectionId - Clear Discovery Cache', () => {
    it('should clear cached discovery for a connection', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.transport.connect(connectionId);
      await app.inject({
        method: 'POST',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/discovery/${connectionId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().data.message).toContain(connectionId);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/discovery/${connectionId}`,
      });
      expect(getRes.statusCode).toBe(404);

      await app.transport.disconnect(connectionId);
      await app.close();
    });

    it('should not delete the connection definition', async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: validStdioConnection,
      });
      const connectionId = createRes.json().data.id;

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/discovery/${connectionId}`,
      });

      const getConnRes = await app.inject({
        method: 'GET',
        url: `/api/v1/connections/${connectionId}`,
      });
      expect(getConnRes.statusCode).toBe(200);
      expect(getConnRes.json().data.id).toBe(connectionId);

      await app.close();
    });

    it('should succeed even when no cache exists for the connection', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/discovery/non-existent',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);

      await app.close();
    });
  });

  describe('GET /api/v1/discovery - List Discovery Cache', () => {
    it('should return summaries of all cached entries', async () => {
      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, id: 'list-cache-1' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, id: 'list-cache-2' },
      });

      await app.transport.connect('list-cache-1');
      await app.transport.connect('list-cache-2');
      await app.inject({
        method: 'POST',
        url: '/api/v1/discovery/list-cache-1',
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/discovery/list-cache-2',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/discovery',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);

      for (const summary of body.data) {
        expect(summary).toHaveProperty('connectionId');
        expect(summary).toHaveProperty('discoveredAt');
        expect(summary).toHaveProperty('toolsCount');
        expect(summary).toHaveProperty('resourcesCount');
        expect(summary).toHaveProperty('promptsCount');
        expect(typeof summary.toolsCount).toBe('number');
        expect(typeof summary.resourcesCount).toBe('number');
        expect(typeof summary.promptsCount).toBe('number');
        expect(summary).not.toHaveProperty('tools');
        expect(summary).not.toHaveProperty('resources');
        expect(summary).not.toHaveProperty('prompts');
      }

      await app.transport.disconnect('list-cache-1');
      await app.transport.disconnect('list-cache-2');
      await app.close();
    });

    it('should return empty array when no cache entries exist', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/discovery',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([]);

      await app.close();
    });

    it('should not include full capability definitions', async () => {
      const app = await buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/v1/connections',
        payload: { ...validStdioConnection, id: 'summary-test' },
      });

      await app.transport.connect('summary-test');
      await app.inject({
        method: 'POST',
        url: '/api/v1/discovery/summary-test',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/discovery',
      });

      const summary = response.json().data[0];
      expect(summary.toolsCount).toBeGreaterThan(0);
      expect(summary.resourcesCount).toBeGreaterThan(0);
      expect(summary.promptsCount).toBeGreaterThan(0);
      expect(summary).not.toHaveProperty('tools');
      expect(summary).not.toHaveProperty('resources');
      expect(summary).not.toHaveProperty('prompts');

      await app.transport.disconnect('summary-test');
      await app.close();
    });
  });

  describe('OpenAPI documentation', () => {
    it('should include discovery endpoints in the specification', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths).toBeDefined();

      await app.close();
    });

    it('should include get cached discovery endpoint', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths['/api/v1/discovery/{connectionId}']).toBeDefined();
      expect(body.paths['/api/v1/discovery/{connectionId}'].get).toBeDefined();

      await app.close();
    });

    it('should include discover capabilities endpoint', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths['/api/v1/discovery/{connectionId}'].post).toBeDefined();

      await app.close();
    });

    it('should include refresh and delete endpoints', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths['/api/v1/discovery/{connectionId}/refresh']).toBeDefined();
      expect(body.paths['/api/v1/discovery/{connectionId}'].delete).toBeDefined();

      await app.close();
    });

    it('should include list cache endpoint', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      const body = response.json();

      expect(body.paths['/api/v1/discovery']).toBeDefined();
      expect(body.paths['/api/v1/discovery'].get).toBeDefined();

      await app.close();
    });
  });
});
