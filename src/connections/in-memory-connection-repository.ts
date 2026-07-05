import type { Connection } from './connection.js';
import type { ConnectionRepository } from './connection-repository.js';

export class InMemoryConnectionRepository implements ConnectionRepository {
  private readonly connections: Map<string, Connection> = new Map();

  async create(connection: Connection): Promise<Connection> {
    this.connections.set(connection.id, connection);
    return connection;
  }

  async update(id: string, data: Partial<Connection>): Promise<Connection> {
    const existing = this.connections.get(id);
    if (!existing) {
      throw new Error(`Connection not found: ${id}`);
    }

    const updated: Connection = {
      ...existing,
      ...data,
      id,
      updatedAt: new Date(),
    };

    this.connections.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.connections.delete(id);
  }

  async findById(id: string): Promise<Connection | null> {
    return this.connections.get(id) ?? null;
  }

  async findAll(): Promise<Connection[]> {
    return Array.from(this.connections.values());
  }
}
