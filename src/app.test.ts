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

describe('GET /health', () => {
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

describe('global error handler', () => {
  it('should return structured error for AppError instances', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

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
