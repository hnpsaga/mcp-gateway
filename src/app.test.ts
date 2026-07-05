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
  it('should return 200 status and ok', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
