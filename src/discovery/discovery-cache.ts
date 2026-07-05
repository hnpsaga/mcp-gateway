import type { DiscoveryResult } from './discovery-types.js';

export interface DiscoveryCacheEntry {
  connectionId: string;
  result: DiscoveryResult;
}

export interface DiscoveryCache {
  get(connectionId: string): DiscoveryResult | undefined;
  set(connectionId: string, result: DiscoveryResult): void;
  delete(connectionId: string): boolean;
  clear(): void;
  has(connectionId: string): boolean;
  entries(): DiscoveryCacheEntry[];
}
