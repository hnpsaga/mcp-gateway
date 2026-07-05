import type { ConnectionRegistry } from '../connections/connection-registry.js';
import { InternalError, NotFoundError, ValidationError } from '../shared/errors/index.js';
import { getLogger, traceSpan } from '../shared/observability/index.js';
import {
  discoveryCacheCounter,
  discoveryRequestsCounter,
} from '../shared/observability/metrics.js';
import type { Transport } from '../transport/transport.js';
import type { DiscoveryCache } from './discovery-cache.js';
import { discoveryResultSchema } from './discovery-schema.js';
import type { CachedDiscoverySummary, DiscoveryResult } from './discovery-types.js';

export class DiscoveryEngine {
  constructor(
    private readonly connectionRegistry: ConnectionRegistry,
    private readonly transport: Transport,
    private readonly cache: DiscoveryCache,
  ) {}

  async discover(connectionId: string): Promise<DiscoveryResult> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'DiscoveryEngine' });
    activeLogger.info({ args: [connectionId] }, 'Starting DiscoveryEngine.discover');

    return traceSpan('DiscoveryEngine.discover', async (span) => {
      if (span) {
        span.setAttribute('service', 'DiscoveryEngine');
        span.setAttribute('method', 'discover');
        span.setAttribute('connectionId', connectionId);
      }

      let transportType = 'unknown';
      try {
        const connection = await this.connectionRegistry.get(connectionId);
        transportType = connection.transportType;
      } catch {
        // Ignore or fall back if connection registry lookup fails
      }

      try {
        await this.ensureConnectionExists(connectionId);

        if (!this.transport.supportsCapability('discover-capabilities')) {
          throw new InternalError('Transport does not support capability discovery', {
            connectionId,
          });
        }

        const transportResult = await this.transport.discoverCapabilities(connectionId);

        if (!transportResult.success) {
          throw new InternalError(transportResult.error ?? 'Capability discovery failed', {
            connectionId,
          });
        }

        if (!transportResult.capabilities) {
          throw new InternalError('Discovery returned no capabilities data', { connectionId });
        }

        const { tools, resources, prompts } = transportResult.capabilities;

        const result: DiscoveryResult = {
          connectionId,
          tools: tools ?? [],
          resources: resources ?? [],
          prompts: prompts ?? [],
          discoveredAt: new Date(),
        };

        const parsed = discoveryResultSchema.safeParse(result);

        if (!parsed.success) {
          throw new ValidationError('Invalid discovery response', parsed.error.issues);
        }

        this.cache.set(connectionId, parsed.data);

        discoveryRequestsCounter.inc({ transport: transportType, status: 'success' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed DiscoveryEngine.discover successfully');

        return parsed.data;
      } catch (error) {
        discoveryRequestsCounter.inc({ transport: transportType, status: 'failure' });
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in DiscoveryEngine.discover: ${msg}`);
        throw error;
      }
    });
  }

  getCached(connectionId: string): DiscoveryResult {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'DiscoveryEngine' });
    activeLogger.debug({ args: [connectionId] }, 'Starting DiscoveryEngine.getCached');

    try {
      const cached = this.cache.get(connectionId);
      if (!cached) {
        discoveryCacheCounter.inc({ result: 'miss' });
        throw new NotFoundError('No cached discovery results found', { connectionId });
      }

      discoveryCacheCounter.inc({ result: 'hit' });
      const diff = process.hrtime(start);
      const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
      activeLogger.debug({ durationMs }, 'Completed DiscoveryEngine.getCached');
      return cached;
    } catch (error) {
      if (!(error instanceof NotFoundError)) {
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ error }, `Error in DiscoveryEngine.getCached: ${msg}`);
      }
      throw error;
    }
  }

  async refresh(connectionId: string): Promise<DiscoveryResult> {
    const start = process.hrtime();
    const activeLogger = getLogger().child({ component: 'DiscoveryEngine' });
    activeLogger.info({ args: [connectionId] }, 'Starting DiscoveryEngine.refresh');

    return traceSpan('DiscoveryEngine.refresh', async (span) => {
      if (span) {
        span.setAttribute('service', 'DiscoveryEngine');
        span.setAttribute('method', 'refresh');
        span.setAttribute('connectionId', connectionId);
      }

      try {
        const result = await this.discover(connectionId);
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        activeLogger.info({ durationMs }, 'Completed DiscoveryEngine.refresh successfully');
        return result;
      } catch (error) {
        const diff = process.hrtime(start);
        const durationMs = (diff[0] + diff[1] / 1e9) * 1000;
        const msg = error instanceof Error ? error.message : String(error);
        activeLogger.error({ durationMs, error }, `Error in DiscoveryEngine.refresh: ${msg}`);
        throw error;
      }
    });
  }

  listCachedSummaries(): CachedDiscoverySummary[] {
    const activeLogger = getLogger().child({ component: 'DiscoveryEngine' });
    activeLogger.debug('Listing cached discovery summaries');
    return this.cache.entries().map(({ connectionId, result }) => ({
      connectionId,
      discoveredAt: result.discoveredAt,
      toolsCount: result.tools.length,
      resourcesCount: result.resources.length,
      promptsCount: result.prompts.length,
    }));
  }

  clearCache(connectionId?: string): void {
    const activeLogger = getLogger().child({ component: 'DiscoveryEngine' });
    activeLogger.info({ connectionId }, 'Clearing discovery cache');
    if (connectionId) {
      this.cache.delete(connectionId);
    } else {
      this.cache.clear();
    }
  }

  private async ensureConnectionExists(connectionId: string): Promise<void> {
    try {
      await this.connectionRegistry.get(connectionId);
    } catch {
      throw new NotFoundError('Connection not found in registry', { connectionId });
    }
  }
}
