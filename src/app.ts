import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastify, { type FastifyInstance } from 'fastify';

import { ConnectionRegistry, InMemoryConnectionRepository } from './connections/index.js';
import { DiscoveryEngine, InMemoryDiscoveryCache } from './discovery/index.js';
import { ExecutionEngine } from './execution/index.js';
import { ApiError } from './lib/api/error-handler.js';
import { v1Routes } from './routes/api/v1/index.js';
import { healthRoutes } from './routes/health.js';
import { StdioTransport } from './transport/stdio-transport.js';

declare module 'fastify' {
  interface FastifyInstance {
    connectionRegistry: ConnectionRegistry;
    discoveryEngine: DiscoveryEngine;
    executionEngine: ExecutionEngine;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: true,
    requestIdHeader: 'request-id',
  });

  const connectionRepository = new InMemoryConnectionRepository();
  const connectionRegistry = new ConnectionRegistry(connectionRepository);
  app.decorate('connectionRegistry', connectionRegistry);

  const discoveryCache = new InMemoryDiscoveryCache();
  const transport = new StdioTransport();
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

  app.setErrorHandler(ApiError);

  await app.register(healthRoutes);

  await app.register(v1Routes, { prefix: '/api/v1' });

  return app;
}
