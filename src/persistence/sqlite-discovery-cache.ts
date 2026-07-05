import { eq } from 'drizzle-orm';

import type { DiscoveryCache, DiscoveryCacheEntry } from '../discovery/discovery-cache.js';
import type { DiscoveryResult } from '../discovery/discovery-types.js';
import { dbOperationsCounter, dbTransactionDuration } from '../shared/observability/metrics.js';
import { getDatabase } from './database.js';
import { discoveryCacheTable } from './schema.js';

function rowToDiscoveryResult(row: {
  connection_id: string;
  discovered_at: string;
  tools: string;
  resources: string;
  prompts: string;
}): DiscoveryResult {
  return {
    connectionId: row.connection_id,
    tools: JSON.parse(row.tools),
    resources: JSON.parse(row.resources),
    prompts: JSON.parse(row.prompts),
    discoveredAt: new Date(row.discovered_at),
  };
}

function getDurationInSeconds(start: [number, number]): number {
  const diff = process.hrtime(start);
  return diff[0] + diff[1] / 1e9;
}

export class SqliteDiscoveryCache implements DiscoveryCache {
  get(connectionId: string): DiscoveryResult | undefined {
    const db = getDatabase();
    const start = process.hrtime();

    try {
      const rows = db
        .select()
        .from(discoveryCacheTable)
        .where(eq(discoveryCacheTable.connection_id, connectionId))
        .all();

      dbOperationsCounter.inc({ operation: 'get', status: 'success' });
      dbTransactionDuration.observe(
        { operation: 'get', status: 'success' },
        getDurationInSeconds(start),
      );

      if (rows.length === 0) return undefined;
      return rowToDiscoveryResult(rows[0]);
    } catch (err) {
      dbOperationsCounter.inc({ operation: 'get', status: 'failure' });
      dbTransactionDuration.observe(
        { operation: 'get', status: 'failure' },
        getDurationInSeconds(start),
      );
      throw err;
    }
  }

  set(connectionId: string, result: DiscoveryResult): void {
    const db = getDatabase();
    const start = process.hrtime();

    try {
      const existing = db
        .select()
        .from(discoveryCacheTable)
        .where(eq(discoveryCacheTable.connection_id, connectionId))
        .all();

      const values = {
        connection_id: connectionId,
        discovered_at: result.discoveredAt.toISOString(),
        tools: JSON.stringify(result.tools),
        resources: JSON.stringify(result.resources),
        prompts: JSON.stringify(result.prompts),
      };

      if (existing.length > 0) {
        db.update(discoveryCacheTable)
          .set(values)
          .where(eq(discoveryCacheTable.connection_id, connectionId))
          .run();
      } else {
        db.insert(discoveryCacheTable).values(values).run();
      }

      dbOperationsCounter.inc({ operation: 'set', status: 'success' });
      dbTransactionDuration.observe(
        { operation: 'set', status: 'success' },
        getDurationInSeconds(start),
      );
    } catch (err) {
      dbOperationsCounter.inc({ operation: 'set', status: 'failure' });
      dbTransactionDuration.observe(
        { operation: 'set', status: 'failure' },
        getDurationInSeconds(start),
      );
      throw err;
    }
  }

  delete(connectionId: string): boolean {
    const db = getDatabase();
    const start = process.hrtime();

    try {
      const existing = this.has(connectionId);

      if (!existing) {
        dbOperationsCounter.inc({ operation: 'delete', status: 'success' });
        dbTransactionDuration.observe(
          { operation: 'delete', status: 'success' },
          getDurationInSeconds(start),
        );
        return false;
      }

      db.delete(discoveryCacheTable)
        .where(eq(discoveryCacheTable.connection_id, connectionId))
        .run();

      dbOperationsCounter.inc({ operation: 'delete', status: 'success' });
      dbTransactionDuration.observe(
        { operation: 'delete', status: 'success' },
        getDurationInSeconds(start),
      );
      return true;
    } catch (err) {
      dbOperationsCounter.inc({ operation: 'delete', status: 'failure' });
      dbTransactionDuration.observe(
        { operation: 'delete', status: 'failure' },
        getDurationInSeconds(start),
      );
      throw err;
    }
  }

  clear(): void {
    const db = getDatabase();
    const start = process.hrtime();

    try {
      db.delete(discoveryCacheTable).run();
      dbOperationsCounter.inc({ operation: 'clear', status: 'success' });
      dbTransactionDuration.observe(
        { operation: 'clear', status: 'success' },
        getDurationInSeconds(start),
      );
    } catch (err) {
      dbOperationsCounter.inc({ operation: 'clear', status: 'failure' });
      dbTransactionDuration.observe(
        { operation: 'clear', status: 'failure' },
        getDurationInSeconds(start),
      );
      throw err;
    }
  }

  has(connectionId: string): boolean {
    const db = getDatabase();
    const start = process.hrtime();

    try {
      const rows = db
        .select({ id: discoveryCacheTable.connection_id })
        .from(discoveryCacheTable)
        .where(eq(discoveryCacheTable.connection_id, connectionId))
        .all();

      dbOperationsCounter.inc({ operation: 'has', status: 'success' });
      dbTransactionDuration.observe(
        { operation: 'has', status: 'success' },
        getDurationInSeconds(start),
      );

      return rows.length > 0;
    } catch (err) {
      dbOperationsCounter.inc({ operation: 'has', status: 'failure' });
      dbTransactionDuration.observe(
        { operation: 'has', status: 'failure' },
        getDurationInSeconds(start),
      );
      throw err;
    }
  }

  entries(): DiscoveryCacheEntry[] {
    const db = getDatabase();
    const start = process.hrtime();

    try {
      const rows = db.select().from(discoveryCacheTable).all();

      dbOperationsCounter.inc({ operation: 'entries', status: 'success' });
      dbTransactionDuration.observe(
        { operation: 'entries', status: 'success' },
        getDurationInSeconds(start),
      );

      return rows.map((row) => ({
        connectionId: row.connection_id,
        result: rowToDiscoveryResult(row),
      }));
    } catch (err) {
      dbOperationsCounter.inc({ operation: 'entries', status: 'failure' });
      dbTransactionDuration.observe(
        { operation: 'entries', status: 'failure' },
        getDurationInSeconds(start),
      );
      throw err;
    }
  }
}
