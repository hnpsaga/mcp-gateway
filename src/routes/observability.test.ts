import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import { config } from '../config/index.js';
import { telemetryContextStorage } from '../shared/observability/context.js';
import { getLogger, logger } from '../shared/observability/logger.js';
import { createTelemetryProxy } from '../shared/observability/proxy.js';

describe('Phase 17 — Observability & Operations', () => {
  it('GET /live should return 200 and alive status', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/live',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('alive');
    expect(body.timestamp).toBeDefined();
    await app.close();
  });

  it('GET /ready should return 200 and database/transport status', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('healthy');
    expect(body.checks).toMatchObject({
      database: 'up',
      transport: 'up',
    });
    await app.close();
  });

  it('GET /info should return 200 with runtime information', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/info',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version).toBeDefined();
    expect(body.uptimeSeconds).toBeTypeOf('number');
    expect(body.startupTimestamp).toBeDefined();
    expect(body.nodeVersion).toBeDefined();
    expect(body.process).toMatchObject({
      pid: expect.any(Number),
      platform: expect.any(String),
      arch: expect.any(String),
    });
    expect(body.memory).toMatchObject({
      rss: expect.any(Number),
      heapTotal: expect.any(Number),
      heapUsed: expect.any(Number),
    });
    expect(body.cpu).toMatchObject({
      user: expect.any(Number),
      system: expect.any(Number),
    });
    await app.close();
  });

  it('GET /metrics should return 200 and Prometheus metrics format', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('mcp_gateway_');
    await app.close();
  });

  describe('Authentication on metrics endpoint', () => {
    let originalAuthEnabled: boolean;
    let originalApiKeys: string[];

    beforeAll(() => {
      originalAuthEnabled = config.AUTH_ENABLED;
      originalApiKeys = config.API_KEYS;
      config.AUTH_ENABLED = true;
      config.API_KEYS = ['test-key-123'];
    });

    afterAll(() => {
      config.AUTH_ENABLED = originalAuthEnabled;
      config.API_KEYS = originalApiKeys;
    });

    it('GET /metrics should require authentication when auth is enabled', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('GET /metrics should succeed with a valid API key', async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
        headers: {
          'x-api-key': 'test-key-123',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('mcp_gateway_');
      await app.close();
    });

    it('GET /live, /ready, and /info should not require authentication even when auth is enabled', async () => {
      const app = await buildApp();

      const liveRes = await app.inject({ method: 'GET', url: '/live' });
      expect(liveRes.statusCode).toBe(200);

      const readyRes = await app.inject({ method: 'GET', url: '/ready' });
      expect(readyRes.statusCode).toBe(200);

      const infoRes = await app.inject({ method: 'GET', url: '/info' });
      expect(infoRes.statusCode).toBe(200);

      await app.close();
    });
  });

  describe('Telemetry Proxy and Context Propagation', () => {
    class MockService {
      async doWork(val: string): Promise<string> {
        const activeLogger = getLogger();
        activeLogger.info({ contextVal: val }, 'Working inside mock service');
        return `done ${val}`;
      }

      async failWork(): Promise<void> {
        throw new Error('Failed job');
      }
    }

    it('should propagate context and log properly through telemetry proxy', async () => {
      const service = new MockService();
      const proxied = createTelemetryProxy(service, 'MockService');

      const mockLog = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        child: () => mockLog,
      };

      const context = {
        requestId: 'req-xyz',
        logger: mockLog as unknown as ReturnType<typeof logger.child>,
      };

      await telemetryContextStorage.run(context, async () => {
        const res = await proxied.doWork('test');
        expect(res).toBe('done test');
      });

      expect(mockLog.info).toHaveBeenCalled();
    });

    it('should sanitize secrets in arguments', async () => {
      const service = {
        register: async (_apiKey: string, _metadata: unknown) => {
          return { status: 'ok' };
        },
      };

      const mockChildLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      };

      const spy = vi
        .spyOn(logger, 'child')
        .mockReturnValue(mockChildLogger as unknown as ReturnType<typeof logger.child>);
      const proxied = createTelemetryProxy(service, 'ConnectionRegistry');

      await proxied.register('sensitive-api-key', { password: 'my-password', count: 5 });

      expect(spy).toHaveBeenCalled();
      expect(mockChildLogger.info).toHaveBeenCalled();
      const loggedArgs = mockChildLogger.info.mock.calls[0][0];
      expect(loggedArgs.args[0]).toBe('[REDACTED]');
      expect(loggedArgs.args[1].password).toBe('[REDACTED]');
      expect(loggedArgs.args[1].count).toBe(5);

      spy.mockRestore();
    });
  });
});
