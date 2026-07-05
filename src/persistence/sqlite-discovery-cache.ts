import { eq } from 'drizzle-orm';

import type { DiscoveryCache, DiscoveryCacheEntry } from '../discovery/discovery-cache.js';
import type { DiscoveryResult } from '../discovery/discovery-types.js';
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

export class SqliteDiscoveryCache implements DiscoveryCache {
  get(connectionId: string): DiscoveryResult | undefined {
    const db = getDatabase();

    const rows = db
      .select()
      .from(discoveryCacheTable)
      .where(eq(discoveryCacheTable.connection_id, connectionId))
      .all();

    if (rows.length === 0) return undefined;
    return rowToDiscoveryResult(rows[0]);
  }

  set(connectionId: string, result: DiscoveryResult): void {
    const db = getDatabase();

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
  }

  delete(connectionId: string): boolean {
    const db = getDatabase();
    const existing = this.has(connectionId);

    if (!existing) return false;

    db.delete(discoveryCacheTable).where(eq(discoveryCacheTable.connection_id, connectionId)).run();

    return true;
  }

  clear(): void {
    const db = getDatabase();
    db.delete(discoveryCacheTable).run();
  }

  has(connectionId: string): boolean {
    const db = getDatabase();

    const rows = db
      .select({ id: discoveryCacheTable.connection_id })
      .from(discoveryCacheTable)
      .where(eq(discoveryCacheTable.connection_id, connectionId))
      .all();

    return rows.length > 0;
  }

  entries(): DiscoveryCacheEntry[] {
    const db = getDatabase();

    const rows = db.select().from(discoveryCacheTable).all();

    return rows.map((row) => ({
      connectionId: row.connection_id,
      result: rowToDiscoveryResult(row),
    }));
  }
}
