import { randomUUID } from 'node:crypto';

import { NotFoundError, ValidationError } from '../shared/errors/index.js';
import { getLogger, sanitize, traceSpan } from '../shared/observability/index.js';
import {
  disabledConnectionsGauge,
  enabledConnectionsGauge,
  registeredConnectionsGauge,
} from '../shared/observability/metrics.js';
import type { Connection, CreateConnectionInput, UpdateConnectionInput } from './connection.js';
import type { ConnectionRepository } from './connection-repository.js';
import { createConnectionSchema, updateConnectionSchema } from './connection-schema.js';

export class ConnectionRegistry {
  constructor(private readonly repository: ConnectionRepository) {}

  private async updateMetrics(): Promise<void> {
    try {
      const connections = await this.repository.findAll();
      registeredConnectionsGauge.set(connections.length);
      enabledConnectionsGauge.set(connections.filter((c) => c.enabled).length);
      disabledConnectionsGauge.set(connections.filter((c) => !c.enabled).length);
    } catch {
      // Avoid failing business logic on metrics update error
    }
  }

  async register(input: CreateConnectionInput): Promise<Connection> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'ConnectionRegistry' });
    activeLogger.info({ args: [sanitize(input)] }, 'Starting ConnectionRegistry.register');

    return traceSpan('ConnectionRegistry.register', async (span) => {
      if (span) {
        span.setAttribute('service', 'ConnectionRegistry');
        span.setAttribute('method', 'register');
      }

      try {
        const parsed = createConnectionSchema.safeParse(input);

        if (!parsed.success) {
          throw new ValidationError('Invalid connection configuration', parsed.error.issues);
        }

        const data = parsed.data;
        const id = data.id ?? randomUUID();

        const existing = await this.repository.findById(id);
        if (existing) {
          throw new ValidationError('A connection with this ID already exists', { id });
        }

        const now = new Date();

        const connection: Connection = {
          id,
          name: data.name,
          description: data.description,
          transportType: data.transportType,
          transportConfig: data.transportConfig as Record<string, unknown>,
          enabled: data.enabled,
          tags: data.tags,
          metadata: data.metadata,
          createdAt: now,
          updatedAt: now,
        };

        const result = await this.repository.create(connection);
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed ConnectionRegistry.register successfully');
        return result;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in ConnectionRegistry.register: ${msg}`);
        throw error;
      }
    });
  }

  async update(id: string, input: UpdateConnectionInput): Promise<Connection> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'ConnectionRegistry' });
    activeLogger.info({ args: [id, sanitize(input)] }, 'Starting ConnectionRegistry.update');

    return traceSpan('ConnectionRegistry.update', async (span) => {
      if (span) {
        span.setAttribute('service', 'ConnectionRegistry');
        span.setAttribute('method', 'update');
      }

      try {
        const existing = await this.repository.findById(id);
        if (!existing) {
          throw new NotFoundError('Connection not found', { id });
        }

        const parsed = updateConnectionSchema.safeParse(input);

        if (!parsed.success) {
          throw new ValidationError('Invalid connection configuration', parsed.error.issues);
        }

        const data = parsed.data as UpdateConnectionInput;

        const updated: Partial<Connection> = {};

        if (data.name !== undefined) updated.name = data.name;
        if (data.description !== undefined) updated.description = data.description;
        if (data.transportType !== undefined) updated.transportType = data.transportType;
        if (data.transportConfig !== undefined) updated.transportConfig = data.transportConfig;
        if (data.enabled !== undefined) updated.enabled = data.enabled;
        if (data.tags !== undefined) updated.tags = data.tags;
        if (data.metadata !== undefined) updated.metadata = data.metadata;

        const result = await this.repository.update(id, updated);
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed ConnectionRegistry.update successfully');
        return result;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in ConnectionRegistry.update: ${msg}`);
        throw error;
      }
    });
  }

  async remove(id: string): Promise<void> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'ConnectionRegistry' });
    activeLogger.info({ args: [id] }, 'Starting ConnectionRegistry.remove');

    return traceSpan('ConnectionRegistry.remove', async (span) => {
      if (span) {
        span.setAttribute('service', 'ConnectionRegistry');
        span.setAttribute('method', 'remove');
      }

      try {
        const existing = await this.repository.findById(id);
        if (!existing) {
          throw new NotFoundError('Connection not found', { id });
        }

        await this.repository.delete(id);
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed ConnectionRegistry.remove successfully');
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in ConnectionRegistry.remove: ${msg}`);
        throw error;
      }
    });
  }

  async get(id: string): Promise<Connection> {
    const connection = await this.repository.findById(id);
    if (!connection) {
      throw new NotFoundError('Connection not found', { id });
    }

    return connection;
  }

  async list(): Promise<Connection[]> {
    return this.repository.findAll();
  }

  async enable(id: string): Promise<Connection> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'ConnectionRegistry' });
    activeLogger.info({ args: [id] }, 'Starting ConnectionRegistry.enable');

    return traceSpan('ConnectionRegistry.enable', async (span) => {
      if (span) {
        span.setAttribute('service', 'ConnectionRegistry');
        span.setAttribute('method', 'enable');
      }

      try {
        const existing = await this.repository.findById(id);
        if (!existing) {
          throw new NotFoundError('Connection not found', { id });
        }

        const result = await this.repository.update(id, { enabled: true });
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed ConnectionRegistry.enable successfully');
        return result;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in ConnectionRegistry.enable: ${msg}`);
        throw error;
      }
    });
  }

  async disable(id: string): Promise<Connection> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'ConnectionRegistry' });
    activeLogger.info({ args: [id] }, 'Starting ConnectionRegistry.disable');

    return traceSpan('ConnectionRegistry.disable', async (span) => {
      if (span) {
        span.setAttribute('service', 'ConnectionRegistry');
        span.setAttribute('method', 'disable');
      }

      try {
        const existing = await this.repository.findById(id);
        if (!existing) {
          throw new NotFoundError('Connection not found', { id });
        }

        const result = await this.repository.update(id, { enabled: false });
        await this.updateMetrics();

        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed ConnectionRegistry.disable successfully');
        return result;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in ConnectionRegistry.disable: ${msg}`);
        throw error;
      }
    });
  }
}
