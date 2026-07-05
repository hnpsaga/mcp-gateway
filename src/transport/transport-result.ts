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

export interface TransportTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface TransportResource {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

export interface TransportPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface DiscoverCapabilitiesResult {
  success: boolean;
  connectionId: string;
  capabilities?: {
    tools: TransportTool[];
    resources: TransportResource[];
    prompts: TransportPrompt[];
  };
  error?: string;
}

export interface TransportExecuteToolResult {
  success: boolean;
  connectionId: string;
  result?: unknown;
  error?: string;
}

export interface TransportReadResourceResult {
  success: boolean;
  connectionId: string;
  contents?: unknown;
  error?: string;
}

export interface TransportExecutePromptResult {
  success: boolean;
  connectionId: string;
  result?: unknown;
  error?: string;
}
