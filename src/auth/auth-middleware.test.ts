import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../lib/api/error-handler.js';
import type { AuthMiddlewareOptions } from './index.js';
import { constantTimeCompare, createAuthHook } from './index.js';

function createTestApp() {
  const app = Fastify();
  app.setErrorHandler(ApiError);
  return app;
}

describe('constantTimeCompare', () => {
  it('should return true for equal strings', () => {
    expect(constantTimeCompare('test-key-1', 'test-key-1')).toBe(true);
  });

  it('should return false for different strings', () => {
    expect(constantTimeCompare('test-key-1', 'test-key-2')).toBe(false);
  });

  it('should return false for different length strings', () => {
    expect(constantTimeCompare('short', 'much-longer-key')).toBe(false);
  });

  it('should handle empty strings', () => {
    expect(constantTimeCompare('', '')).toBe(true);
    expect(constantTimeCompare('', 'key')).toBe(false);
    expect(constantTimeCompare('key', '')).toBe(false);
  });

  it('should handle special characters', () => {
    expect(constantTimeCompare('key-with-dashes', 'key-with-dashes')).toBe(true);
    expect(constantTimeCompare('key!@#$%', 'key!@#$%')).toBe(true);
    expect(constantTimeCompare('key!@#$%', 'key!@#$%^')).toBe(false);
  });

  it('should handle UUID-style keys', () => {
    const key = '550e8400-e29b-41d4-a716-446655440000';
    expect(constantTimeCompare(key, key)).toBe(true);
    expect(constantTimeCompare(key, '550e8400-e29b-41d4-a716-446655440001')).toBe(false);
  });
});

describe('auth middleware', () => {
  const defaultOptions: AuthMiddlewareOptions = {
    enabled: true,
    apiKeys: ['valid-key-1', 'valid-key-2'],
    headerName: 'x-api-key',
    bearerEnabled: false,
    swaggerAuthenticate: false,
  };

  describe('when enabled', () => {
    it('should allow requests with valid API key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-api-key': 'valid-key-1' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });

      await app.close();
    });

    it('should accept any configured API key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-api-key': 'valid-key-2' },
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should reject requests without API key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Missing API key');

      await app.close();
    });

    it('should reject requests with invalid API key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-api-key': 'invalid-key' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Invalid API key');

      await app.close();
    });

    it('should reject requests with empty API key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-api-key': '' },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });

  describe('when disabled', () => {
    it('should allow requests without API key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook({ ...defaultOptions, enabled: false }));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should allow requests with random headers', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook({ ...defaultOptions, enabled: false }));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-api-key': 'anything' },
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });
  });

  describe('public endpoints', () => {
    it('should allow /health without API key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/health', async () => ({ status: 'ok' }));

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should allow /api/v1/health without API key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/api/v1/health', async () => ({ status: 'ok' }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should protect non-public routes', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/api/v1/connections', async () => ({ data: [] }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/connections',
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });

  describe('custom header configuration', () => {
    it('should read API key from custom header', async () => {
      const app = createTestApp();
      app.addHook(
        'onRequest',
        createAuthHook({
          ...defaultOptions,
          headerName: 'x-custom-auth',
        }),
      );
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-custom-auth': 'valid-key-1' },
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should reject when key sent to wrong header', async () => {
      const app = createTestApp();
      app.addHook(
        'onRequest',
        createAuthHook({
          ...defaultOptions,
          headerName: 'x-custom-auth',
        }),
      );
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-api-key': 'valid-key-1' },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });

  describe('bearer token support', () => {
    const bearerOptions: AuthMiddlewareOptions = {
      ...defaultOptions,
      bearerEnabled: true,
    };

    it('should accept API key in X-API-Key header', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(bearerOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-api-key': 'valid-key-1' },
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should accept API key as Bearer token', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(bearerOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer valid-key-1' },
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });

    it('should reject invalid Bearer token', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(bearerOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer invalid-key' },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('should reject malformed Authorization header', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(bearerOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Basic dGVzdDpwYXNz' },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });
  });

  describe('swagger authentication', () => {
    it('should allow swagger access without auth when swaggerAuthenticate is false', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/documentation', async () => ({ ui: true }));
      app.get('/documentation/json', async () => ({ spec: true }));

      const uiResponse = await app.inject({
        method: 'GET',
        url: '/documentation',
      });
      expect(uiResponse.statusCode).toBe(200);

      const jsonResponse = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      });
      expect(jsonResponse.statusCode).toBe(200);

      await app.close();
    });

    it('should require auth for swagger when swaggerAuthenticate is true', async () => {
      const app = createTestApp();
      app.addHook(
        'onRequest',
        createAuthHook({
          ...defaultOptions,
          swaggerAuthenticate: true,
        }),
      );
      app.get('/documentation', async () => ({ ui: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/documentation',
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('should allow auth for swagger when swaggerAuthenticate is true and valid key provided', async () => {
      const app = createTestApp();
      app.addHook(
        'onRequest',
        createAuthHook({
          ...defaultOptions,
          swaggerAuthenticate: true,
        }),
      );
      app.get('/documentation', async () => ({ ui: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/documentation',
        headers: { 'x-api-key': 'valid-key-1' },
      });

      expect(response.statusCode).toBe(200);

      await app.close();
    });
  });

  describe('error responses', () => {
    it('should return consistent 401 format for missing key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });
      const body = response.json();

      expect(response.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Missing API key');

      await app.close();
    });

    it('should return consistent 401 format for invalid key', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-api-key': 'wrong' },
      });
      const body = response.json();

      expect(response.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Invalid API key');

      await app.close();
    });

    it('should not expose sensitive configuration in error response', async () => {
      const app = createTestApp();
      app.addHook('onRequest', createAuthHook(defaultOptions));
      app.get('/test', async () => ({ ok: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { 'x-api-key': 'wrong' },
      });
      const body = JSON.stringify(response.json());

      expect(body).not.toContain('valid-key-1');
      expect(body).not.toContain('valid-key-2');

      await app.close();
    });
  });
});
