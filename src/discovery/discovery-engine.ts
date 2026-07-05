import type { ConnectionRegistry } from '../connections/connection-registry.js';
import { InternalError, NotFoundError, ValidationError } from '../shared/errors/index.js';
import type { Transport } from '../transport/transport.js';
import type { DiscoveryCache } from './discovery-cache.js';
import { discoveryResultSchema } from './discovery-schema.js';
import type { DiscoveryResult } from './discovery-types.js';

export class DiscoveryEngine {
  constructor(
    private readonly connectionRegistry: ConnectionRegistry,
    private readonly transport: Transport,
    private readonly cache: DiscoveryCache,
  ) {}

  async discover(connectionId: string): Promise<DiscoveryResult> {
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
    return parsed.data;
  }

  getCached(connectionId: string): DiscoveryResult {
    const cached = this.cache.get(connectionId);
    if (!cached) {
      throw new NotFoundError('No cached discovery results found', { connectionId });
    }
    return cached;
  }

  async refresh(connectionId: string): Promise<DiscoveryResult> {
    return this.discover(connectionId);
  }

  clearCache(connectionId?: string): void {
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
