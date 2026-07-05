import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { InternalError, NotFoundError, ValidationError } from './shared/errors/index.js';

describe('application bootstrap', () => {
  it('should build the app successfully', async () => {
    const app = await buildApp();
    expect(app).toBeDefined();
    expect(app.server).toBeDefined();
    await app.close();
  });
});

describe('root health endpoint (GET /health)', () => {
  it('should return 200 status with service details', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toMatchObject({
      status: 'ok',
      service: 'mcp-gateway',
      version: expect.any(String),
      timestamp: expect.any(String),
    });

    const timestamp = new Date(body.timestamp);
    expect(timestamp.getTime()).toBeGreaterThan(0);

    await app.close();
  });
});

describe('API version registration', () => {
  it('should register routes under /api/v1 prefix', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toMatchObject({
      status: 'ok',
    });

    await app.close();
  });
});

describe('OpenAPI generation', () => {
  it('should generate OpenAPI specification at /documentation/json', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toMatchObject({
      openapi: expect.any(String),
      info: {
        title: 'MCP Gateway API',
        version: '1.0.0',
      },
    });

    await app.close();
  });

  it('should include health endpoint in the specification', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });
    const body = response.json();

    expect(body.paths).toBeDefined();
    const healthPath = body.paths['/api/v1/health'];
    expect(healthPath).toBeDefined();
    expect(healthPath.get).toBeDefined();

    await app.close();
  });
});

describe('Swagger UI availability', () => {
  it('should serve Swagger UI at /documentation', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/documentation',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');

    await app.close();
  });
});

describe('global error handler', () => {
  it('should return 400 for ValidationError', async () => {
    const app = await buildApp();
    app.get('/test-validation', () => {
      throw new ValidationError('Invalid input', { field: 'name' });
    });
    const response = await app.inject({
      method: 'GET',
      url: '/test-validation',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'name' },
      },
    });
    await app.close();
  });

  it('should return 404 for NotFoundError', async () => {
    const app = await buildApp();
    app.get('/test-not-found', () => {
      throw new NotFoundError('Connection not found', { id: 'abc' });
    });
    const response = await app.inject({
      method: 'GET',
      url: '/test-not-found',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Connection not found',
        details: { id: 'abc' },
      },
    });
    await app.close();
  });

  it('should return 500 for InternalError', async () => {
    const app = await buildApp();
    app.get('/test-internal', () => {
      throw new InternalError('Something went wrong');
    });
    const response = await app.inject({
      method: 'GET',
      url: '/test-internal',
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      },
    });
    await app.close();
  });

  it('should return 500 for unknown errors', async () => {
    const app = await buildApp();
    app.get('/test-unknown', () => {
      throw new Error('Unknown error');
    });
    const response = await app.inject({
      method: 'GET',
      url: '/test-unknown',
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
    await app.close();
  });
});

describe('global request validation', () => {
  it('should return 400 for schema validation failures', async () => {
    const app = await buildApp();
    app.post(
      '/test-validate',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
            },
          },
        },
      },
      async () => {
        return { success: true };
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/test-validate',
      payload: {},
    });
    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Request validation failed');
    expect(body.error.details).toBeDefined();

    await app.close();
  });
});

describe('request IDs', () => {
  it('should include request-id in response headers', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.headers['request-id']).toBeDefined();
    expect(typeof response.headers['request-id']).toBe('string');

    await app.close();
  });

  it('should preserve a provided request-id header', async () => {
    const app = await buildApp();
    const testId = 'test-correlation-id-123';
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'request-id': testId,
      },
    });
    expect(response.headers['request-id']).toBe(testId);

    await app.close();
  });
});

describe('route registration', () => {
  it('should have all placeholder route modules registered', async () => {
    const app = await buildApp();
    const routes = app.printRoutes();

    expect(routes).toContain('api/v1/health');

    await app.close();
  });
});
