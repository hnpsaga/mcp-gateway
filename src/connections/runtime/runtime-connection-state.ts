import type { ConnectionStatus } from './connection-status.js';

export interface RuntimeConnectionState {
  connectionId: string;
  status: ConnectionStatus;
  lastConnectionAttempt: Date | null;
  lastSuccessfulConnection: Date | null;
  lastDisconnectTime: Date | null;
  lastFailure: Date | null;
  failureReason: string | null;
  retryCount: number;
  runtimeMetadata: Record<string, unknown>;
}
