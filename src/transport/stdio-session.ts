import type { JsonRpcClient } from './json-rpc-client.js';
import type { StdioProcessManager } from './stdio-process-manager.js';

export type SessionState = 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'failed';

export interface StdioSession {
  connectionId: string;
  process: StdioProcessManager;
  client: JsonRpcClient;
  state: SessionState;
  createdAt: Date;
  serverCapabilities: Record<string, unknown>;
  protocolVersion: string;
}
