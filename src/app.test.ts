import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

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
