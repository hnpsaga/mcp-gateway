import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastify, { type FastifyInstance } from 'fastify';

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

  await app.register(fastifySwagger, {
    openapi: {
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
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
  });

  app.addHook('onSend', (_request, reply, _payload, done) => {
    void reply.header('request-id', reply.request.id);
    done();
  });

  app.addHook('onClose', (_app, done) => {
    closeDatabase();
    done();
  });

  app.setErrorHandler(ApiError);

  await app.register(healthRoutes);

  await app.register(v1Routes, { prefix: '/api/v1' });

  return app;
}
