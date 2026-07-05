export type TransportStatus =
  'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'failed';

export interface ConnectResult {
  success: boolean;
  connectionId: string;
  status: TransportStatus;
  error?: string;
}

export interface DisconnectResult {
  success: boolean;
  connectionId: string;
  status: TransportStatus;
  error?: string;
}

export interface TransportStatusResult {
  connectionId: string;
  status: TransportStatus;
  details?: Record<string, unknown>;
}
