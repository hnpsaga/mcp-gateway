import { eq } from 'drizzle-orm';

import type { RuntimeConnectionState } from '../connections/runtime/runtime-connection-state.js';
import type { RuntimeStateRepository } from '../connections/runtime/runtime-state-repository.js';
import { getDatabase } from './database.js';
import { PersistenceError } from './errors.js';
import { runtimeStateTable } from './schema.js';

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function rowToRuntimeState(row: {
  connection_id: string;
  status: string;
  last_connection_attempt: string | null;
  last_successful_connection: string | null;
  last_disconnect_time: string | null;
  last_failure: string | null;
  failure_reason: string | null;
  retry_count: number;
  runtime_metadata: string;
}): RuntimeConnectionState {
  return {
    connectionId: row.connection_id,
    status: row.status as RuntimeConnectionState['status'],
    lastConnectionAttempt: parseDate(row.last_connection_attempt),
    lastSuccessfulConnection: parseDate(row.last_successful_connection),
    lastDisconnectTime: parseDate(row.last_disconnect_time),
    lastFailure: parseDate(row.last_failure),
    failureReason: row.failure_reason,
    retryCount: row.retry_count,
    runtimeMetadata: JSON.parse(row.runtime_metadata) as Record<string, unknown>,
  };
}

export class SqliteRuntimeStateRepository implements RuntimeStateRepository {
  async save(state: RuntimeConnectionState): Promise<void> {
    const db = getDatabase();

    try {
      const existing = db
        .select({ id: runtimeStateTable.connection_id })
        .from(runtimeStateTable)
        .where(eq(runtimeStateTable.connection_id, state.connectionId))
        .all();

      const values = {
        connection_id: state.connectionId,
        status: state.status,
        last_connection_attempt: state.lastConnectionAttempt?.toISOString() ?? null,
        last_successful_connection: state.lastSuccessfulConnection?.toISOString() ?? null,
        last_disconnect_time: state.lastDisconnectTime?.toISOString() ?? null,
        last_failure: state.lastFailure?.toISOString() ?? null,
        failure_reason: state.failureReason,
        retry_count: state.retryCount,
        runtime_metadata: JSON.stringify(state.runtimeMetadata),
      };

      if (existing.length > 0) {
        db.update(runtimeStateTable)
          .set(values)
          .where(eq(runtimeStateTable.connection_id, state.connectionId))
          .run();
      } else {
        db.insert(runtimeStateTable).values(values).run();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new PersistenceError('Failed to save runtime state', {
        connectionId: state.connectionId,
        error: message,
      });
    }
  }

  async findById(connectionId: string): Promise<RuntimeConnectionState | null> {
    const db = getDatabase();

    try {
      const rows = db
        .select()
        .from(runtimeStateTable)
        .where(eq(runtimeStateTable.connection_id, connectionId))
        .all();

      if (rows.length === 0) return null;
      return rowToRuntimeState(rows[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new PersistenceError('Failed to find runtime state', {
        connectionId,
        error: message,
      });
    }
  }

  async findAll(): Promise<RuntimeConnectionState[]> {
    const db = getDatabase();

    try {
      const rows = db.select().from(runtimeStateTable).all();

      return rows.map(rowToRuntimeState);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new PersistenceError('Failed to list runtime states', { error: message });
    }
  }

  async delete(connectionId: string): Promise<void> {
    const db = getDatabase();

    try {
      db.delete(runtimeStateTable).where(eq(runtimeStateTable.connection_id, connectionId)).run();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new PersistenceError('Failed to delete runtime state', {
        connectionId,
        error: message,
      });
    }
  }
}
