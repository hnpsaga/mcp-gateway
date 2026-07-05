import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
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
import { StdioTransport } from './transport/stdio-transport.js';
import type { Transport } from './transport/transport.js';

declare module 'fastify' {
  interface FastifyInstance {
    connectionRegistry: ConnectionRegistry;
    discoveryEngine: DiscoveryEngine;
    executionEngine: ExecutionEngine;
    transport: Transport;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: true,
    requestIdHeader: 'request-id',
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

  app.addHook('onClose', (_app, done) => {
    closeDatabase();
    done();
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

  return app;
}
