import type {
  ConnectResult,
  DisconnectResult,
  DiscoverCapabilitiesResult,
  TransportStatusResult,
} from './transport-result.js';

export interface Transport {
  connect(connectionId: string): Promise<ConnectResult>;
  disconnect(connectionId: string): Promise<DisconnectResult>;
  getStatus(connectionId: string): Promise<TransportStatusResult>;
  discoverCapabilities(connectionId: string): Promise<DiscoverCapabilitiesResult>;
  supportsCapability(capability: string): boolean;
}
