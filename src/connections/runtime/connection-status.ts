export const CONNECTION_STATUSES = [
  'registered',
  'connecting',
  'connected',
  'disconnecting',
  'disconnected',
  'failed',
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const STATUS_TRANSITIONS: Record<ConnectionStatus, ConnectionStatus[]> = {
  registered: ['connecting'],
  connecting: ['connected', 'failed'],
  connected: ['disconnecting', 'failed'],
  disconnecting: ['disconnected', 'failed'],
  disconnected: ['connecting'],
  failed: ['failed'],
};
