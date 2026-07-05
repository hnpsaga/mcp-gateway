import type { TransportType } from './transport-type.js';

export interface TransportConfig {
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  cwd?: string;
  requestTimeout?: number;
  [key: string]: unknown;
}

export interface Connection {
  id: string;
  name: string;
  description: string;
  transportType: TransportType;
  transportConfig: TransportConfig;
  enabled: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConnectionInput {
  id?: string;
  name: string;
  description?: string;
  transportType: TransportType;
  transportConfig: TransportConfig;
  enabled?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateConnectionInput {
  name?: string;
  description?: string;
  transportType?: TransportType;
  transportConfig?: TransportConfig;
  enabled?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
