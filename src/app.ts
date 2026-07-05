import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { SpanStatusCode } from '@opentelemetry/api';
import fastify, { type FastifyInstance } from 'fastify';

import { createAuthHook } from './auth/index.js';
import { config } from './config/index.js';
import { ConnectionRegistry } from './connections/index.js';
import { DiscoveryEngine } from './discovery/index.js';
import { ExecutionEngine } from './execution/index.js';
import { ApiError } from './lib/api/error-handler.js';
import {
  buildDatabaseConfig,
  closeDatabase,
  initializeDatabase,
  runMigrations,
  SqliteConnectionRepository,
  SqliteDiscoveryCache,
} from './persistence/index.js';
import { v1Routes } from './routes/api/v1/index.js';
import { healthRoutes } from './routes/health.js';
import {
  logger,
  shutdownTracing,
  telemetryContextStorage,
  tracer,
} from './shared/observability/index.js';
import {
  httpActiveRequests,
  httpRequestCounter,
  httpRequestDuration,
} from './shared/observability/metrics.js';
import { StdioTransport } from './transport/stdio-transport.js';
import type { Transport } from './transport/transport.js';

declare module 'fastify' {
  interface FastifyInstance {
    connectionRegistry: ConnectionRegistry;
    discoveryEngine: DiscoveryEngine;
    executionEngine: ExecutionEngine;
    transport: Transport;
  }
  interface FastifyRequest {
    startTime?: [number, number];
    span?: import('@opentelemetry/api').Span;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    loggerInstance: logger,
    requestIdHeader: 'request-id',
  });

  logger.info({ version: '1.0.0' }, 'MCP Gateway starting...');

  // Request tracing, metrics, and correlation context
  app.addHook('onRequest', (request, reply, done) => {
    request.startTime = process.hrtime();
    if (config.METRICS_ENABLED) {
      httpActiveRequests.inc();
    }

    if (config.OTEL_ENABLED) {
      const span = tracer.startSpan(
        `HTTP ${request.method} ${request.routeOptions?.url || request.url}`,
        {
          attributes: {
            'http.method': request.method,
            'http.url': request.url,
            'request.id': request.id,
          },
        },
      );
      request.span = span;
    }

    const context = {
      requestId: request.id,
      logger: request.log,
    };

    telemetryContextStorage.run(context, () => {
      done();
    });
  });

  app.addHook('onError', (request, _reply, error, done) => {
    const span = request.span;
    if (span) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    }
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    const startTime = request.startTime;
    if (startTime) {
      const diff = process.hrtime(startTime);
      const durationSec = diff[0] + diff[1] / 1e9;
      if (config.METRICS_ENABLED) {
        const route = request.routeOptions?.url || request.url;
        httpRequestCounter.inc({
          method: request.method,
          route,
          status_code: reply.statusCode,
        });
        httpRequestDuration.observe(
          {
            method: request.method,
            route,
            status_code: reply.statusCode,
          },
          durationSec,
        );
        httpActiveRequests.dec();
      }
    }

    const span = request.span;
    if (span) {
      span.setAttribute('http.status_code', reply.statusCode);
      if (reply.statusCode >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
    }
    done();
  });

  const dbConfig = buildDatabaseConfig(config);
  const db = initializeDatabase(dbConfig);
  runMigrations(db);

  const connectionRepository = new SqliteConnectionRepository();

  const connectionRegistry = new ConnectionRegistry(connectionRepository);
  app.decorate('connectionRegistry', connectionRegistry);

  const discoveryCache = new SqliteDiscoveryCache();

  const transport = new StdioTransport(connectionRegistry);
  app.decorate('transport', transport);

  const discoveryEngine = new DiscoveryEngine(connectionRegistry, transport, discoveryCache);
  app.decorate('discoveryEngine', discoveryEngine);

  const executionEngine = new ExecutionEngine(connectionRegistry, discoveryEngine, transport);
  app.decorate('executionEngine', executionEngine);

  const openapi: Record<string, unknown> = {
    info: {
      title: 'MCP Gateway API',
      description: 'REST API for managing and interacting with MCP servers',
      version: '1.0.0',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: config.AUTH_HEADER_NAME,
          description: 'API key authentication',
        },
      },
    },
  };

  if (config.AUTH_ENABLED) {
    openapi.security = [{ ApiKeyAuth: [] }];
  }

  await app.register(fastifySwagger, { openapi });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
  });

  app.addHook('onSend', (_request, reply, _payload, done) => {
    void reply.header('request-id', reply.request.id);
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('X-Frame-Options', 'DENY');
    void reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    done();
  });

  app.addHook('onClose', async (_app) => {
    logger.info('MCP Gateway shutting down...');
    closeDatabase();
    await shutdownTracing();
    logger.info('MCP Gateway shut down complete');
  });

  app.addHook(
    'onRequest',
    createAuthHook({
      enabled: config.AUTH_ENABLED,
      apiKeys: config.API_KEYS,
      headerName: config.AUTH_HEADER_NAME,
      bearerEnabled: config.AUTH_BEARER_ENABLED,
      swaggerAuthenticate: config.AUTH_SWAGGER_AUTHENTICATE,
    }),
  );

  app.setErrorHandler(ApiError);

  await app.register(healthRoutes);

  await app.register(v1Routes, { prefix: '/api/v1' });

  return app as unknown as FastifyInstance;
}
