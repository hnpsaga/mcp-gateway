import type { ConnectResult, DisconnectResult, TransportStatusResult } from './transport-result.js';

export interface Transport {
  connect(connectionId: string): Promise<ConnectResult>;
  disconnect(connectionId: string): Promise<DisconnectResult>;
  getStatus(connectionId: string): Promise<TransportStatusResult>;
  supportsCapability(capability: string): boolean;
}
