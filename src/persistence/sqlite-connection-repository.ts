import { eq } from 'drizzle-orm';

import type { Connection } from '../connections/connection.js';
import type { ConnectionRepository } from '../connections/connection-repository.js';
import { getDatabase } from './database.js';
import { PersistenceError } from './errors.js';
import { connectionsTable } from './schema.js';

function rowToConnection(row: {
  id: string;
  name: string;
  description: string;
  transport_type: string;
  transport_config: string;
  enabled: number;
  tags: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}): Connection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    transportType: row.transport_type as Connection['transportType'],
    transportConfig: JSON.parse(row.transport_config) as Record<string, unknown>,
    enabled: row.enabled === 1,
    tags: JSON.parse(row.tags) as string[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function connectionToRow(connection: Connection) {
  return {
    id: connection.id,
    name: connection.name,
    description: connection.description,
    transport_type: connection.transportType,
    transport_config: JSON.stringify(connection.transportConfig),
    enabled: connection.enabled ? 1 : 0,
    tags: JSON.stringify(connection.tags),
    metadata: JSON.stringify(connection.metadata),
    created_at: connection.createdAt.toISOString(),
    updated_at: connection.updatedAt.toISOString(),
  };
}

export class SqliteConnectionRepository implements ConnectionRepository {
  async create(connection: Connection): Promise<Connection> {
    const db = getDatabase();

    try {
      db.insert(connectionsTable).values(connectionToRow(connection)).run();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('UNIQUE constraint failed')) {
        throw new PersistenceError(`Connection already exists: ${connection.id}`, {
          id: connection.id,
        });
      }
      throw new PersistenceError('Failed to create connection', {
        id: connection.id,
        error: message,
      });
    }

    return connection;
  }

  async update(id: string, data: Partial<Connection>): Promise<Connection> {
    const db = getDatabase();

    const existing = await this.findById(id);
    if (!existing) {
      throw new PersistenceError(`Connection not found: ${id}`, { id });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.transportType !== undefined) updateData.transport_type = data.transportType;
    if (data.transportConfig !== undefined)
      updateData.transport_config = JSON.stringify(data.transportConfig);
    if (data.enabled !== undefined) updateData.enabled = data.enabled ? 1 : 0;
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags);
    if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata);

    try {
      db.update(connectionsTable).set(updateData).where(eq(connectionsTable.id, id)).run();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new PersistenceError('Failed to update connection', { id, error: message });
    }

    const updated = await this.findById(id);
    return updated!;
  }

  async delete(id: string): Promise<void> {
    const db = getDatabase();

    try {
      db.delete(connectionsTable).where(eq(connectionsTable.id, id)).run();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new PersistenceError('Failed to delete connection', { id, error: message });
    }
  }

  async findById(id: string): Promise<Connection | null> {
    const db = getDatabase();

    try {
      const rows = db.select().from(connectionsTable).where(eq(connectionsTable.id, id)).all();

      if (rows.length === 0) return null;
      return rowToConnection(rows[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new PersistenceError('Failed to find connection', { id, error: message });
    }
  }

  async findAll(): Promise<Connection[]> {
    const db = getDatabase();

    try {
      const rows = db.select().from(connectionsTable).all();

      return rows.map(rowToConnection);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new PersistenceError('Failed to list connections', { error: message });
    }
  }
}
