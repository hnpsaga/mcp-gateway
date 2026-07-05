import { createRequire } from 'node:module';

import type { FastifyInstance } from 'fastify';
import prom from 'prom-client';

import { config } from '../config/index.js';
import { getDatabase } from '../persistence/database.js';
import { connectionsTable } from '../persistence/schema.js';
import {
  activeConnectionsGauge,
  disabledConnectionsGauge,
  enabledConnectionsGauge,
  registeredConnectionsGauge,
  transportConnectionsGauge,
} from '../shared/observability/metrics.js';

const require = createRequire(import.meta.url);
const { name: serviceName, version: appVersion } = require('../../package.json');
const startupTime = new Date();

export async function healthRoutes(fastify: FastifyInstance) {
  // Existing health endpoint
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      service: serviceName,
      version: appVersion,
      timestamp: new Date().toISOString(),
    };
  });

  // Liveness endpoint
  fastify.get('/live', async () => {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  });

  // Readiness endpoint
  fastify.get('/ready', async (request, reply) => {
    let dbOk = false;
    try {
      const db = getDatabase();
      db.select({ id: connectionsTable.id }).from(connectionsTable).limit(1).all();
      dbOk = true;
    } catch (err) {
      request.log.error({ err }, 'Readiness check failed: Database is not accessible');
    }

    let transportOk = false;
    try {
      if (fastify.transport && typeof fastify.transport.supportsCapability === 'function') {
        transportOk = true;
      }
    } catch (err) {
      request.log.error({ err }, 'Readiness check failed: Transport check failed');
    }

    if (!dbOk || !transportOk) {
      return reply.code(503).send({
        status: 'unhealthy',
        checks: {
          database: dbOk ? 'up' : 'down',
          transport: transportOk ? 'up' : 'down',
        },
      });
    }

    return {
      status: 'healthy',
      checks: {
        database: 'up',
        transport: 'up',
      },
    };
  });

  // Runtime information endpoint
  fastify.get('/info', async () => {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    return {
      version: appVersion,
      uptimeSeconds: Math.floor(process.uptime()),
      startupTimestamp: startupTime.toISOString(),
      nodeVersion: process.version,
      process: {
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
      },
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
      },
    };
  });

  // Metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    if (config.METRICS_ENABLED) {
      try {
        const db = getDatabase();
        const connections = db.select().from(connectionsTable).all();
        registeredConnectionsGauge.set(connections.length);
        enabledConnectionsGauge.set(connections.filter((c) => c.enabled === 1).length);
        disabledConnectionsGauge.set(connections.filter((c) => c.enabled === 0).length);
      } catch (err) {
        request.log.error({ err }, 'Error collecting connection metrics for database');
      }

      try {
        const registry = fastify.connectionRegistry;
        const transport = fastify.transport;
        if (registry && transport) {
          const list = await registry.list();
          let active = 0;
          const activeByTransport = new Map<string, number>();
          for (const conn of list) {
            const status = await transport.getStatus(conn.id);
            if (status.status === 'connected') {
              active++;
              activeByTransport.set(
                conn.transportType,
                (activeByTransport.get(conn.transportType) ?? 0) + 1,
              );
            }
          }
          activeConnectionsGauge.set(active);
          for (const conn of list) {
            transportConnectionsGauge.set(
              { transport_type: conn.transportType },
              activeByTransport.get(conn.transportType) ?? 0,
            );
          }
        }
      } catch (err) {
        request.log.error({ err }, 'Error collecting active transport connection metrics');
      }
    }

    reply.header('Content-Type', prom.register.contentType);
    return prom.register.metrics();
  });
}
