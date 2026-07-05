import { randomUUID } from 'node:crypto';

import { NotFoundError, ValidationError } from '../shared/errors/index.js';
import type { Connection, CreateConnectionInput, UpdateConnectionInput } from './connection.js';
import type { ConnectionRepository } from './connection-repository.js';
import { createConnectionSchema, updateConnectionSchema } from './connection-schema.js';

export class ConnectionRegistry {
  constructor(private readonly repository: ConnectionRepository) {}

  async register(input: CreateConnectionInput): Promise<Connection> {
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

    return this.repository.create(connection);
  }

  async update(id: string, input: UpdateConnectionInput): Promise<Connection> {
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

    return this.repository.update(id, updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError('Connection not found', { id });
    }

    await this.repository.delete(id);
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
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError('Connection not found', { id });
    }

    return this.repository.update(id, { enabled: true });
  }

  async disable(id: string): Promise<Connection> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError('Connection not found', { id });
    }

    return this.repository.update(id, { enabled: false });
  }
}
