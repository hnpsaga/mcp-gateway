import type { JsonRpcClient } from './json-rpc-client.js';

export type SessionState = 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'failed';

export interface HttpSession {
  connectionId: string;
  client: JsonRpcClient;
  state: SessionState;
  createdAt: Date;
  serverCapabilities: Record<string, unknown>;
  protocolVersion: string;
  url: string;
  headers: Record<string, string>;
  requestTimeout: number;
}
