import type { Transport } from './transport.js';
import type { ConnectResult, DisconnectResult, TransportStatusResult } from './transport-result.js';

export abstract class BaseTransport implements Transport {
  async connect(connectionId: string): Promise<ConnectResult> {
    return {
      success: true,
      connectionId,
      status: 'connected',
    };
  }

  async disconnect(connectionId: string): Promise<DisconnectResult> {
    return {
      success: true,
      connectionId,
      status: 'disconnected',
    };
  }

  async getStatus(connectionId: string): Promise<TransportStatusResult> {
    return {
      connectionId,
      status: 'connected',
    };
  }

  supportsCapability(capability: string): boolean {
    return ['connect', 'disconnect', 'status'].includes(capability);
  }
}
