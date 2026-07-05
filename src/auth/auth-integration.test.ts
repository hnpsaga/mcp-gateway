import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';

describe('auth integration with app', () => {
  it('should include security scheme in OpenAPI spec', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/documentation/json' });
    const spec = response.json();
    expect(spec.components.securitySchemes.ApiKeyAuth).toBeDefined();
    expect(spec.components.securitySchemes.ApiKeyAuth.type).toBe('apiKey');
    expect(spec.components.securitySchemes.ApiKeyAuth.in).toBe('header');
    expect(spec.components.securitySchemes.ApiKeyAuth.name).toBe('x-api-key');
    await app.close();
  });

  it('should include security headers in responses', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    await app.close();
  });

  it('should not require security globally when auth disabled', async () => {
    const app = await buildApp();
    const spec = await app.inject({ method: 'GET', url: '/documentation/json' });
    expect(spec.json().security).toBeUndefined();
    await app.close();
  });
});
