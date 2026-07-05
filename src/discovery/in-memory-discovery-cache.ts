import type { DiscoveryCache } from './discovery-cache.js';
import type { DiscoveryResult } from './discovery-types.js';

export class InMemoryDiscoveryCache implements DiscoveryCache {
  private readonly cache = new Map<string, DiscoveryResult>();

  get(connectionId: string): DiscoveryResult | undefined {
    return this.cache.get(connectionId);
  }

  set(connectionId: string, result: DiscoveryResult): void {
    this.cache.set(connectionId, result);
  }

  delete(connectionId: string): boolean {
    return this.cache.delete(connectionId);
  }

  clear(): void {
    this.cache.clear();
  }

  has(connectionId: string): boolean {
    return this.cache.has(connectionId);
  }
}
